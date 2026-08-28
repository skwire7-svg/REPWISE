/**
 * AI diet-plan generation.
 *
 * The calorie and macro targets are computed by lib/fitness/metrics.ts and
 * passed in — the model's job is to fill those numbers with meals, not to
 * decide them. Its own totals are re-checked against ours before the plan is
 * stored, because a response schema guarantees the shape of a response and
 * never its arithmetic.
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
import type { GeneratedDietPlanInput } from "@/lib/db/diet";
import {
  calculateAge,
  calculateMacroTargets,
  isCalorieTargetSafe,
} from "@/lib/fitness/metrics";
import type { CompleteProfile, MealType } from "@/lib/types/database";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

/** Gemini's wire schema and the Zod validator — see the note in workout-plan.ts. */
const DIET_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Two or three sentences on the approach.",
    },
    meals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          meal_type: {
            type: Type.STRING,
            enum: [...MEAL_TYPES],
          },
          name: { type: Type.STRING },
          description: {
            type: Type.STRING,
            description: "Main ingredients and rough portions.",
          },
          kcal: { type: Type.INTEGER },
          protein_g: { type: Type.INTEGER },
          carbs_g: { type: Type.INTEGER },
          fat_g: { type: Type.INTEGER },
        },
        required: [
          "meal_type",
          "name",
          "description",
          "kcal",
          "protein_g",
          "carbs_g",
          "fat_g",
        ],
        propertyOrdering: [
          "meal_type",
          "name",
          "description",
          "kcal",
          "protein_g",
          "carbs_g",
          "fat_g",
        ],
      },
    },
  },
  required: ["summary", "meals"],
  propertyOrdering: ["summary", "meals"],
};

const DietSchema = z.object({
  summary: z.string(),
  meals: z.array(
    z.object({
      meal_type: z.enum(MEAL_TYPES),
      name: z.string(),
      description: z.string(),
      kcal: z.number().int(),
      protein_g: z.number().int(),
      carbs_g: z.number().int(),
      fat_g: z.number().int(),
    }),
  ),
});

export type GenerateDietResult =
  | { ok: true; plan: GeneratedDietPlanInput }
  | { ok: false; error: string };

export async function generateDietPlan(
  profile: CompleteProfile,
): Promise<GenerateDietResult> {
  const client = createGemini();
  if (!client) return { ok: false, error: AI_NOT_CONFIGURED };

  const targets = calculateMacroTargets({
    sex: profile.sex,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    age: calculateAge(profile.date_of_birth),
    activityLevel: profile.activity_level,
    goal: profile.goal,
  });

  // Our own maths should never produce an unsafe target, but this is the last
  // point before those numbers reach a user — a bug upstream shouldn't ship a
  // starvation diet.
  const safety = isCalorieTargetSafe(targets.targetKcal, targets.tdee, profile.sex);
  if (!safety.safe) {
    return {
      ok: false,
      error: safety.reason ?? "Calculated targets failed a safety check.",
    };
  }

  const system = `
You are a nutrition coach building a day of eating.

${SAFETY_RULES}

Design a full day of meals that adds up to the targets given. Include breakfast,
lunch and dinner, plus one or two snacks. Aim within 5% of the calorie target
and within 10 g on each macro.

Meals must be ordinary food a person can actually shop for and cook — no
supplements, no powders beyond plain whey, no exotic ingredients. Respect the
stated dietary preference and allergies absolutely.

Give each meal a short name and a one- or two-sentence description covering the
main ingredients and rough portions.

Write the summary as plain prose, the way a coach would say it out loud.
No markdown, no asterisks, no bold, no headings, no bullet characters.
`.trim();

  try {
    const result = await generateJson({
      client,
      system,
      prompt: `Build my daily meal plan.\n\n${describeProfile(profile)}`,
      responseSchema: DIET_RESPONSE_SCHEMA,
      validator: DietSchema,
    });

    if (!result.ok) return result;
    const parsed = result.data;

    if (parsed.meals.length === 0) {
      return { ok: false, error: "Gemini returned no meals. Try again." };
    }

    const meals = parsed.meals.map((meal) => ({
      mealType: meal.meal_type as MealType,
      name: meal.name,
      description: meal.description,
      kcal: Math.max(0, meal.kcal),
      proteinG: Math.max(0, meal.protein_g),
      carbsG: Math.max(0, meal.carbs_g),
      fatG: Math.max(0, meal.fat_g),
    }));

    // The stored targets are always ours, never the model's — the meals are a
    // suggestion for hitting them, and if the model's arithmetic drifted the
    // user should see honest targets alongside slightly-off meals rather than
    // targets quietly rewritten to match whatever it produced.
    const mealKcal = meals.reduce((sum, meal) => sum + meal.kcal, 0);
    const drift = Math.abs(mealKcal - targets.targetKcal) / targets.targetKcal;

    const summary =
      drift > 0.1
        ? `${parsed.summary}\n\nNote: these meals total ${mealKcal} kcal against your ${targets.targetKcal} kcal target — adjust portions to close the gap.`
        : parsed.summary;

    return {
      ok: true,
      plan: {
        targetKcal: targets.targetKcal,
        proteinG: targets.proteinG,
        carbsG: targets.carbsG,
        fatG: targets.fatG,
        summary,
        meals,
      },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
