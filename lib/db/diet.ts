/**
 * Diet plans (what was prescribed) and meal logs (what was actually eaten).
 *
 * These are deliberately separate tables rather than one with a flag: a plan is
 * a template that persists across days, while a log belongs to exactly one
 * date, and merging them makes "what did I eat last Tuesday" unanswerable.
 */

import { createClient } from "@/lib/supabase/server";
import type { DietPlan, DietPlanMeal, MealLog, MealType } from "@/lib/types/database";

// --- Plans ------------------------------------------------------------------

export interface FullDietPlan extends DietPlan {
  diet_plan_meals: DietPlanMeal[];
}

export async function getActiveDietPlan(
  userId: string,
): Promise<FullDietPlan | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("diet_plans")
    .select("*, diet_plan_meals(*)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const plan = data as unknown as FullDietPlan;
  plan.diet_plan_meals.sort((a, b) => a.position - b.position);
  return plan;
}

export interface GeneratedDietPlanInput {
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  summary: string;
  meals: Array<{
    mealType: MealType;
    name: string;
    description: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }>;
}

/**
 * Stores a generated diet plan and makes it active.
 *
 * Same fail-safe ordering as saveGeneratedPlan(): build the new plan fully,
 * then switch over, so an error mid-write never leaves the user with no plan.
 */
export async function saveGeneratedDietPlan(
  userId: string,
  input: GeneratedDietPlanInput,
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: plan, error: planError } = await supabase
    .from("diet_plans")
    .insert({
      user_id: userId,
      target_kcal: input.targetKcal,
      protein_g: input.proteinG,
      carbs_g: input.carbsG,
      fat_g: input.fatG,
      summary: input.summary,
      is_active: false,
    })
    .select("id")
    .single<{ id: string }>();

  if (planError || !plan) {
    return {
      ok: false,
      error: planError?.message ?? "Could not create the diet plan.",
    };
  }

  if (input.meals.length > 0) {
    const { error: mealsError } = await supabase.from("diet_plan_meals").insert(
      input.meals.map((meal, position) => ({
        diet_plan_id: plan.id,
        meal_type: meal.mealType,
        position,
        name: meal.name,
        description: meal.description,
        kcal: meal.kcal,
        protein_g: meal.proteinG,
        carbs_g: meal.carbsG,
        fat_g: meal.fatG,
      })),
    );

    if (mealsError) return { ok: false, error: mealsError.message };
  }

  await supabase
    .from("diet_plans")
    .update({ is_active: false })
    .eq("user_id", userId)
    .neq("id", plan.id);

  const { error: activateError } = await supabase
    .from("diet_plans")
    .update({ is_active: true })
    .eq("id", plan.id);

  if (activateError) return { ok: false, error: activateError.message };

  return { ok: true, planId: plan.id };
}

// --- Meal logging -----------------------------------------------------------

export async function getMealLogs(
  userId: string,
  loggedOn: string,
): Promise<MealLog[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("meal_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("logged_on", loggedOn)
    .order("created_at", { ascending: true });

  return (data ?? []) as MealLog[];
}

export interface DayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function sumMeals(meals: MealLog[]): DayTotals {
  return meals.reduce<DayTotals>(
    (total, meal) => ({
      kcal: total.kcal + meal.kcal,
      proteinG: total.proteinG + meal.protein_g,
      carbsG: total.carbsG + meal.carbs_g,
      fatG: total.fatG + meal.fat_g,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

export async function logMeal(input: {
  userId: string;
  loggedOn: string;
  mealType: MealType;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // Plain insert, not upsert: eating two snacks in a day is normal, so each
  // entry is its own row.
  const { error } = await supabase.from("meal_logs").insert({
    user_id: input.userId,
    logged_on: input.loggedOn,
    meal_type: input.mealType,
    name: input.name,
    kcal: input.kcal,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteMealLog(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meal_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Daily calorie totals over a window, for the Progress and Dashboard charts. */
export async function getDailyIntake(
  userId: string,
  days = 14,
): Promise<Array<{ day: string; kcal: number; proteinG: number }>> {
  const supabase = await createClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("meal_logs")
    .select("logged_on, kcal, protein_g")
    .eq("user_id", userId)
    .gte("logged_on", sinceIso)
    .order("logged_on", { ascending: true });

  const rows = (data ?? []) as Array<{
    logged_on: string;
    kcal: number;
    protein_g: number;
  }>;

  const byDay = new Map<string, { day: string; kcal: number; proteinG: number }>();
  for (const row of rows) {
    const existing = byDay.get(row.logged_on) ?? {
      day: row.logged_on,
      kcal: 0,
      proteinG: 0,
    };
    existing.kcal += row.kcal;
    existing.proteinG += row.protein_g;
    byDay.set(row.logged_on, existing);
  }

  return [...byDay.values()];
}
