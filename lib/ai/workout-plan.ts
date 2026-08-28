/**
 * AI workout-plan generation.
 *
 * The model chooses *which* exercises and *how many* sets; it never invents an
 * exercise. It picks slugs from the library we hand it, and anything it returns
 * that isn't in that library is dropped before the plan is stored — a
 * hallucinated slug would otherwise fail the foreign key at insert time and
 * lose the whole plan.
 */

import { z } from "zod";
import { Type, type Schema } from "@google/genai";
import {
  createGemini,
  describeError,
  generateJson,
  AI_NOT_CONFIGURED,
} from "@/lib/ai/client";
import { describeProfile, SAFETY_RULES } from "@/lib/ai/context";
import type { GeneratedPlanInput } from "@/lib/db/workouts";
import type { CompleteProfile, Exercise } from "@/lib/types/database";

/**
 * Two schemas describing the same payload, for two different jobs.
 *
 * `PLAN_RESPONSE_SCHEMA` is Gemini's own schema dialect — an OpenAPI subset —
 * and constrains what the model is allowed to emit. `PlanSchema` is Zod and
 * validates what actually arrived. They have to be kept in step by hand; the
 * Gemini SDK has no Zod adapter, and hand-writing the wire schema is better
 * than a conversion layer that silently emits keywords Gemini rejects.
 */
const PLAN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Short name for the plan." },
    summary: {
      type: Type.STRING,
      description: "Two or three sentences on the approach.",
    },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'e.g. "Upper A".' },
          focus: { type: Type.STRING, description: 'e.g. "Chest and back".' },
          exercises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                exercise_slug: {
                  type: Type.STRING,
                  description: "Copied verbatim from the supplied library.",
                },
                target_sets: { type: Type.INTEGER },
                target_reps: {
                  type: Type.STRING,
                  description: 'Rep range as text, e.g. "8-12" or "AMRAP".',
                },
                rest_seconds: { type: Type.INTEGER },
                notes: { type: Type.STRING },
              },
              required: [
                "exercise_slug",
                "target_sets",
                "target_reps",
                "rest_seconds",
                "notes",
              ],
              propertyOrdering: [
                "exercise_slug",
                "target_sets",
                "target_reps",
                "rest_seconds",
                "notes",
              ],
            },
          },
        },
        required: ["name", "focus", "exercises"],
        propertyOrdering: ["name", "focus", "exercises"],
      },
    },
  },
  required: ["name", "summary", "days"],
  propertyOrdering: ["name", "summary", "days"],
};

const PlanSchema = z.object({
  name: z.string(),
  summary: z.string(),
  days: z.array(
    z.object({
      name: z.string(),
      focus: z.string(),
      exercises: z.array(
        z.object({
          exercise_slug: z.string(),
          target_sets: z.number().int(),
          target_reps: z.string(),
          rest_seconds: z.number().int(),
          notes: z.string(),
        }),
      ),
    }),
  ),
});

export type GenerateResult =
  | { ok: true; plan: GeneratedPlanInput }
  | { ok: false; error: string };

export async function generateWorkoutPlan(
  profile: CompleteProfile,
  library: Exercise[],
): Promise<GenerateResult> {
  const client = createGemini();
  if (!client) return { ok: false, error: AI_NOT_CONFIGURED };

  if (library.length === 0) {
    return {
      ok: false,
      error:
        "The exercise library is empty. Run supabase/seed.sql in the Supabase SQL Editor first.",
    };
  }

  // Slug first so the model can copy it verbatim, then just enough detail to
  // choose sensibly. Sending full instructions for 100+ exercises would be
  // mostly wasted input tokens.
  const catalogue = library
    .map(
      (ex) =>
        `${ex.slug} | ${ex.name} | ${ex.primary_muscle} | ${ex.equipment} | ${ex.difficulty}${
          ex.is_compound ? " | compound" : ""
        }`,
    )
    .join("\n");

  const system = `
You are a strength coach building a training plan.

${SAFETY_RULES}

Build exactly ${profile.days_per_week} training days. Every exercise must be
chosen from the library below by copying its slug exactly — never invent a slug,
and never use an exercise whose equipment the user does not have.

Sensible defaults: 3-5 exercises per day, compounds before isolation, 60-90s
rest for isolation and 120-180s for heavy compounds. Rep ranges as text such as
"8-12" or "AMRAP". Match volume and difficulty to the user's experience level —
a beginner does not need six exercises per session.

Write the summary as plain prose, the way a coach would say it out loud.
No markdown, no asterisks, no bold, no headings, no bullet characters.

Exercise library (slug | name | primary muscle | equipment | difficulty):
${catalogue}
`.trim();

  try {
    const result = await generateJson({
      client,
      system,
      prompt: `Build my training plan.\n\n${describeProfile(profile)}`,
      responseSchema: PLAN_RESPONSE_SCHEMA,
      validator: PlanSchema,
    });

    if (!result.ok) return result;
    const parsed = result.data;

    const bySlug = new Map(library.map((ex) => [ex.slug, ex]));

    const days = parsed.days.map((day) => ({
      name: day.name,
      focus: day.focus,
      exercises: day.exercises
        .map((ex) => {
          const match = bySlug.get(ex.exercise_slug);
          if (!match) return null; // hallucinated slug — drop it
          return {
            exerciseId: match.id,
            // Clamp to the column's check constraint. The response schema can't
            // enforce numeric bounds, so a model that asks for 20 sets would
            // otherwise fail the insert.
            targetSets: Math.min(12, Math.max(1, ex.target_sets)),
            targetReps: ex.target_reps.slice(0, 20),
            restSeconds: Math.min(600, Math.max(0, ex.rest_seconds)),
            notes: ex.notes || undefined,
          };
        })
        .filter((ex): ex is NonNullable<typeof ex> => ex !== null),
    }));

    if (days.every((day) => day.exercises.length === 0)) {
      return {
        ok: false,
        error: "The generated plan had no usable exercises. Try again.",
      };
    }

    return {
      ok: true,
      plan: {
        name: parsed.name,
        goal: profile.goal,
        location: profile.training_location,
        daysPerWeek: days.length,
        summary: parsed.summary,
        days,
      },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
