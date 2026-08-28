/**
 * AI coach chat, streamed.
 *
 * Both halves of every exchange are persisted to Supabase: the user's message
 * before the model is called, and the assistant's reply once the stream
 * finishes. The reply is saved from inside the stream rather than by the
 * client, so a conversation survives the user closing the tab mid-answer.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FinishReason } from "@google/genai";
import {
  createGemini,
  describeError,
  withRetry,
  MODEL,
  AI_NOT_CONFIGURED,
} from "@/lib/ai/client";
import { COACH_VOICE, describeProfile, SAFETY_RULES } from "@/lib/ai/context";
import { getAuthedUser } from "@/lib/auth/session";
import { appendMessage, getMessages, titleThreadFromFirstMessage } from "@/lib/db/coach";
import { getProfile } from "@/lib/db/profile";
import { getWeightLogs } from "@/lib/db/progress";
import { getActivePlan, getRecentSessions } from "@/lib/db/workouts";
import { isCompleteProfile } from "@/lib/types/database";

// The dashboard's data layer reads cookies and the filesystem-free Supabase
// client, both of which need Node rather than Edge.
export const runtime = "nodejs";

const RequestSchema = z.object({
  threadId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const client = createGemini();
  if (!client) {
    return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
  }

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) {
    return NextResponse.json(
      { error: "Finish onboarding before using the coach." },
      { status: 400 },
    );
  }

  const { threadId, message } = parsed.data;

  // History is read *before* the new message is stored, so the turn we just
  // received isn't duplicated as both history and the current question.
  const history = await getMessages(threadId);

  // Kicked off now rather than after the writes below. It reads the plan,
  // recent sessions and weight log — three more round trips that depend on
  // none of the writes, so running them concurrently takes a chunk off the
  // delay before the first token reaches the user.
  const systemPromise = buildSystemPrompt(user.id, profile);
  // Nothing awaits this on the 403 path, and an unobserved rejection would
  // take down the process rather than the request.
  systemPromise.catch(() => {});

  const saved = await appendMessage({
    threadId,
    userId: user.id,
    role: "user",
    content: message,
  });

  // A failed insert here means the thread id didn't pass RLS — almost always a
  // thread belonging to someone else. Fail rather than answer off-the-record.
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 403 });
  }

  if (history.length === 0) {
    await titleThreadFromFirstMessage(threadId, message);
  }

  const system = await systemPromise;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let full = "";

      try {
        // Only opening the stream is retried. Once bytes have been sent to the
        // client a retry would replay them, so a mid-stream failure falls
        // through to the catch below and keeps the partial answer.
        const modelStream = await withRetry(() =>
          client.models.generateContentStream({
            model: MODEL,
            // Gemini calls the assistant side of a conversation "model", and
            // the turns must alternate starting from the user. Our stored
            // history already alternates, so this is a straight relabelling.
            contents: [
              ...history.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
              })),
              { role: "user", parts: [{ text: message }] },
            ],
            config: {
              systemInstruction: system,
              maxOutputTokens: 8192,
            },
          }),
        );

        // Tracked across chunks because the reason a stream ended only arrives
        // on the final chunk — and a safety stop looks exactly like a normal
        // short answer until you read it.
        let finishReason: FinishReason | undefined;

        for await (const chunk of modelStream) {
          const delta = chunk.text;
          if (delta) {
            full += delta;
            controller.enqueue(encoder.encode(delta));
          }
          finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
        }

        if (
          finishReason === FinishReason.SAFETY ||
          finishReason === FinishReason.PROHIBITED_CONTENT ||
          finishReason === FinishReason.BLOCKLIST ||
          finishReason === FinishReason.SPII
        ) {
          const note =
            "\n\n_I can't help with that one — it's outside what a training and nutrition coach should answer._";
          full += note;
          controller.enqueue(encoder.encode(note));
        } else if (finishReason === FinishReason.MAX_TOKENS) {
          const note = "\n\n_(cut off — ask me to continue)_";
          full += note;
          controller.enqueue(encoder.encode(note));
        }
      } catch (error) {
        const note = `\n\n_Error: ${describeError(error)}_`;
        full += note;
        controller.enqueue(encoder.encode(note));
      } finally {
        // Persist whatever was produced, including a partial answer — a reply
        // cut off halfway is still context the next turn needs, and losing it
        // makes the thread read as if the coach never responded.
        if (full.trim()) {
          await appendMessage({
            threadId,
            userId: user.id,
            role: "assistant",
            content: full,
            model: MODEL,
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Stops nginx and similar proxies buffering the whole answer and
      // delivering it in one lump, which defeats streaming entirely.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Grounds the coach in the user's actual data.
 *
 * Without this the model gives generic advice that contradicts the plan and
 * targets the rest of the app is showing — the single most common way an AI
 * coach feels broken.
 */
async function buildSystemPrompt(
  userId: string,
  profile: Parameters<typeof describeProfile>[0],
): Promise<string> {
  const [plan, sessions, weights] = await Promise.all([
    getActivePlan(userId),
    getRecentSessions(userId, 5),
    getWeightLogs(userId, 10),
  ]);

  const planText = plan
    ? `Active plan: "${plan.name}" (${plan.days_per_week} days/week)\n` +
      plan.plan_days
        .map(
          (day) =>
            `  Day ${day.day_index + 1} — ${day.name}: ` +
            day.plan_exercises
              .map(
                (ex) =>
                  `${ex.exercise?.name ?? "unknown"} ${ex.target_sets}x${ex.target_reps}`,
              )
              .join(", "),
        )
        .join("\n")
    : "Active plan: none yet — the user can generate one on the Plan tab.";

  const sessionText = sessions.length
    ? sessions
        .map(
          (s) =>
            `  ${s.started_at.slice(0, 10)} — ${s.name} (${s.set_logs.length} sets logged)`,
        )
        .join("\n")
    : "  none logged yet";

  const weightText = weights.length
    ? weights.map((w) => `${w.logged_on}: ${w.weight_kg} kg`).join(", ")
    : "no weigh-ins logged yet";

  return `
You are the coach at Repwise. You are texting one person — the one whose
numbers are below — the way a real coach texts a client between sets.

${SAFETY_RULES}

${COACH_VOICE}

WHAT YOU SAY

Ground every answer in their real numbers. If they ask "should I add weight?",
answer from the sets they actually logged, not in general terms. If the data
needed to answer isn't below, say what you'd need rather than guessing.

--- THE USER ---
${describeProfile(profile)}

--- THEIR TRAINING ---
${planText}

Recent sessions:
${sessionText}

Bodyweight log: ${weightText}
`.trim();
}
