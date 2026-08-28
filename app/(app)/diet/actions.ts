"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateDietPlan } from "@/lib/ai/diet-plan";
import { requireUser } from "@/lib/auth/session";
import { deleteMealLog, logMeal, saveGeneratedDietPlan } from "@/lib/db/diet";
import { getProfile } from "@/lib/db/profile";
import { isCompleteProfile, type MealType } from "@/lib/types/database";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function generateDietPlanAction(): Promise<ActionResult> {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) {
    return { ok: false, error: "Finish onboarding first." };
  }

  const generated = await generateDietPlan(profile);
  if (!generated.ok) return generated;

  const saved = await saveGeneratedDietPlan(user.id, generated.plan);
  if (!saved.ok) return saved;

  revalidatePath("/diet");
  revalidatePath("/dashboard");
  return { ok: true };
}

const LogMealSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().trim().min(1, "Give the meal a name").max(120),
  kcal: z.coerce.number().int().min(0).max(10000),
  proteinG: z.coerce.number().int().min(0).max(1000),
  carbsG: z.coerce.number().int().min(0).max(1000),
  fatG: z.coerce.number().int().min(0).max(1000),
  loggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * What the form sends — number inputs produce strings. Declared by hand
 * because `z.coerce.number()` reports its output type as its input type.
 */
export interface LogMealInput {
  mealType: MealType;
  name: string;
  kcal: string | number;
  proteinG: string | number;
  carbsG: string | number;
  fatG: string | number;
  loggedOn: string;
}

export async function logMealAction(input: LogMealInput): Promise<ActionResult> {
  const parsed = LogMealSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid meal." };
  }

  const user = await requireUser();
  const result = await logMeal({ userId: user.id, ...parsed.data });

  if (result.ok) {
    revalidatePath("/diet");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function deleteMealAction(id: string): Promise<ActionResult> {
  await requireUser();
  const result = await deleteMealLog(id);

  if (result.ok) {
    revalidatePath("/diet");
    revalidatePath("/dashboard");
  }
  return result;
}
