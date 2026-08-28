import { GoogleGenAI, FinishReason, type Schema } from "@google/genai";
import type { ZodType } from "zod";
import { geminiApiKey } from "@/lib/config";

/**
 * Gemini client. Server-only — importing this from a client component would
 * ship the API key to the browser.
 *
 * Returns null when no key is configured, so pages can render a "connect your
 * API key" state instead of crashing. Every caller must handle the null.
 */
export function createGemini(): GoogleGenAI | null {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * The model every feature uses.
 *
 * Named here rather than inline so the coach, the workout generator and the
 * diet generator can never drift onto different models — which would otherwise
 * show up as one feature quietly behaving differently from the rest.
 *
 * Flash rather than Pro because this app is built against the free tier, where
 * Flash has by far the more usable request quota. It supports the two things
 * all three features need: JSON mode with a response schema, and streaming.
 *
 * Why this exact version, measured against this project's key:
 *   - gemini-2.5-flash    retired — 404s for keys created after its cutoff
 *   - gemini-3.7-flash    503, currently overloaded
 *   - gemini-flash-latest 503 — the alias resolves to 3.7, so it inherits that
 *   - gemini-3.1-flash-lite  works, but "lite" trades away plan quality
 *   - gemini-3.6-flash    works, full Flash quality  <- chosen
 *
 * Pinned rather than tracking the `-latest` alias: an alias silently moving to
 * an overloaded or behaviourally different model is harder to diagnose than a
 * pinned name that fails loudly when it retires. If this 404s one day, the
 * error below names the fix, and `npm run check:ai` confirms a replacement.
 */
export const MODEL = "gemini-3.6-flash";

/** 503/overloaded is transient and worth retrying; nothing else here is. */
const TRANSIENT_ERROR = /\b503\b|UNAVAILABLE|overloaded|high load/i;

/**
 * Retries a call through a transient upstream failure.
 *
 * Free-tier Flash capacity fluctuates — a model can return 503 "currently
 * experiencing high load" for a few seconds at a time. Without this, that shows
 * up to the user as a failed plan generation they have to trigger again by
 * hand, which reads as the feature being broken.
 *
 * Deliberately does NOT retry quota errors: a 429 on the free tier means the
 * per-minute allowance is spent, and hammering it makes the wait longer.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!TRANSIENT_ERROR.test(message) || attempt === attempts - 1) throw error;
      // 600ms, then 1.2s — long enough for a capacity blip to clear, short
      // enough that the user is still watching the spinner.
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    }
  }

  throw lastError;
}

export const AI_NOT_CONFIGURED =
  "The AI features need a Gemini API key. Add GEMINI_API_KEY to .env.local and restart the dev server.";

/**
 * Output budget for the two structured generators.
 *
 * On 2.5 Flash, thinking tokens are billed against this same ceiling, so it has
 * to cover the model's reasoning *and* the JSON. Too low and a plan comes back
 * truncated mid-object, which surfaces as a JSON parse error rather than
 * anything self-explanatory — hence the explicit MAX_TOKENS branch below.
 */
const PLAN_MAX_OUTPUT_TOKENS = 16384;

export type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One request, one JSON object, validated.
 *
 * Both generators need the identical sequence — call the model in JSON mode,
 * work out whether the response is usable, parse it, then check it against a
 * schema — so it lives here rather than being written twice with two subtly
 * different sets of failure branches.
 *
 * `responseSchema` constrains what the model emits; `validator` re-checks what
 * actually arrived. That is deliberate belt-and-braces: JSON mode guarantees
 * syntactically valid JSON matching the declared shape, but it is still a model
 * output, and every downstream caller here writes to Postgres.
 */
export async function generateJson<T>({
  client,
  system,
  prompt,
  responseSchema,
  validator,
}: {
  client: GoogleGenAI;
  system: string;
  prompt: string;
  responseSchema: Schema;
  validator: ZodType<T>;
}): Promise<JsonResult<T>> {
  const response = await withRetry(() =>
    client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema,
        maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS,
      },
    }),
  );

  // A prompt rejected before generation reports on promptFeedback; a response
  // stopped during generation reports on the candidate. They need separate
  // checks because a blocked prompt produces no candidate at all.
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    return {
      ok: false,
      error:
        "Gemini declined this request. Check your profile for anything that reads as a medical request.",
    };
  }

  const finishReason = response.candidates?.[0]?.finishReason;

  if (
    finishReason === FinishReason.SAFETY ||
    finishReason === FinishReason.PROHIBITED_CONTENT ||
    finishReason === FinishReason.BLOCKLIST ||
    finishReason === FinishReason.SPII
  ) {
    return {
      ok: false,
      error:
        "Gemini declined to answer this one. Check your profile for anything that reads as a medical request.",
    };
  }

  if (finishReason === FinishReason.MAX_TOKENS) {
    return {
      ok: false,
      error:
        "The response was cut off before it finished. Try again — if it keeps happening, reduce your training days per week.",
    };
  }

  const text = response.text;
  if (!text) {
    return { ok: false, error: "Gemini returned an empty response. Try again." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Gemini returned unreadable JSON. Try again." };
  }

  const parsed = validator.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Gemini returned a response in an unexpected shape. Try again.",
    };
  }

  return { ok: true, data: parsed.data };
}

/** Turns an SDK error into something worth showing a user. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Something went wrong talking to the AI.";
  }

  const message = error.message;

  // The three a user can actually act on. Gemini reports these as RPC status
  // names in the error body, so match on those rather than HTTP codes — the
  // SDK does not surface a typed status field.
  if (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("429") ||
    message.includes("quota")
  ) {
    return (
      "You've hit the Gemini free-tier rate limit. Wait a minute and try again — " +
      "the free tier allows a limited number of requests per minute and per day."
    );
  }

  if (
    message.includes("API_KEY_INVALID") ||
    message.includes("API key not valid") ||
    message.includes("PERMISSION_DENIED") ||
    message.includes("UNAUTHENTICATED")
  ) {
    return "Your Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.";
  }

  // Retired models are the likeliest cause here: Google withdraws older Gemini
  // versions from new API keys, and the 404 body names the replacement.
  if (message.includes("model not found") || message.includes("NOT_FOUND")) {
    return (
      `The model "${MODEL}" isn't available to this API key — it may have been ` +
      `retired. Update MODEL in lib/ai/client.ts, then run \`npm run check:ai\`.`
    );
  }

  if (TRANSIENT_ERROR.test(message)) {
    return "Gemini is overloaded right now. Wait a few seconds and try again.";
  }

  return message;
}
