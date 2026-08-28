/**
 * Deterministic body-metric and macro maths.
 *
 * Nothing in this file may ever be delegated to the AI. The model chooses which
 * exercises and meals to prescribe; these functions decide the numbers those
 * choices must satisfy. Language models are unreliable at arithmetic, and a
 * hallucinated calorie target is the most dangerous bug this app could ship.
 *
 * References: Mifflin-St Jeor (1990) for RMR; standard activity multipliers;
 * protein targets in the 1.6-2.2 g/kg range supported by current resistance
 * training literature.
 */

import type {
  ActivityLevel,
  FitnessGoal,
  Sex,
} from "@/lib/types/database";

/** Hard floors below which a target is never safe to prescribe unsupervised. */
export const CALORIE_FLOOR: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  other: 1200,
};

/** Never move more than this fraction away from maintenance. */
export const MAX_DEFICIT_FRACTION = 0.25;
export const MAX_SURPLUS_FRACTION = 0.25;

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little deliberate movement
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // moderate exercise 3-5 days/week
  active: 1.725, // hard exercise 6-7 days/week
  very_active: 1.9, // physical job or two-a-day training
};

/** Calorie adjustment applied to TDEE, as a fraction of maintenance. */
const GOAL_CALORIE_ADJUSTMENT: Record<FitnessGoal, number> = {
  lose_fat: -0.2,
  build_muscle: +0.1,
  gain_strength: +0.05,
  stay_fit: 0,
};

/** Protein in g per kg bodyweight. Highest in a deficit, to spare lean mass. */
const GOAL_PROTEIN_PER_KG: Record<FitnessGoal, number> = {
  lose_fat: 2.2,
  build_muscle: 2.0,
  gain_strength: 1.8,
  stay_fit: 1.6,
};

/** Fat floor in g per kg bodyweight, for hormonal health. */
const FAT_PER_KG_FLOOR = 0.8;

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export interface BodyMetricsInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
}

export interface MacroTargets {
  /** Basal metabolic rate, kcal/day. */
  bmr: number;
  /** Total daily energy expenditure (maintenance), kcal/day. */
  tdee: number;
  /** Goal-adjusted, floor-clamped daily target, kcal/day. */
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** True when a safety floor or cap overrode the raw goal adjustment. */
  wasClamped: boolean;
  /** Human-readable reason, present only when `wasClamped` is true. */
  clampReason?: string;
}

/** Whole years between `dateOfBirth` and now. */
export function calculateAge(dateOfBirth: Date | string): number {
  const dob =
    typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Mifflin-St Jeor basal metabolic rate.
 *
 * The equation is only defined for male and female. For `other` we average the
 * two constants rather than defaulting to one — it keeps the estimate centred
 * instead of systematically over- or under-shooting.
 */
export function calculateBMR(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const constant = sex === "male" ? 5 : sex === "female" ? -161 : (5 - 161) / 2;
  return Math.round(base + constant);
}

/** Maintenance calories: BMR scaled by day-to-day activity. */
export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activity]);
}

/**
 * Full macro prescription for a profile.
 *
 * Order matters: the goal adjustment is applied first, then capped at
 * ±MAX_*_FRACTION of maintenance, then raised to the absolute floor. The floor
 * wins over everything — an aggressive cut on a small, sedentary person can
 * otherwise produce a target that is genuinely unsafe to follow unsupervised.
 */
export function calculateMacroTargets(input: BodyMetricsInput): MacroTargets {
  const { sex, weightKg, heightCm, age, activityLevel, goal } = input;

  const bmr = calculateBMR(sex, weightKg, heightCm, age);
  const tdee = calculateTDEE(bmr, activityLevel);

  const rawTarget = Math.round(tdee * (1 + GOAL_CALORIE_ADJUSTMENT[goal]));

  const minByFraction = Math.round(tdee * (1 - MAX_DEFICIT_FRACTION));
  const maxByFraction = Math.round(tdee * (1 + MAX_SURPLUS_FRACTION));
  const floor = CALORIE_FLOOR[sex];

  let targetKcal = rawTarget;
  let wasClamped = false;
  let clampReason: string | undefined;

  if (targetKcal < minByFraction) {
    targetKcal = minByFraction;
    wasClamped = true;
    clampReason = `Deficit capped at ${MAX_DEFICIT_FRACTION * 100}% below maintenance.`;
  } else if (targetKcal > maxByFraction) {
    targetKcal = maxByFraction;
    wasClamped = true;
    clampReason = `Surplus capped at ${MAX_SURPLUS_FRACTION * 100}% above maintenance.`;
  }

  if (targetKcal < floor) {
    targetKcal = floor;
    wasClamped = true;
    clampReason = `Raised to the ${floor} kcal minimum safe intake.`;
  }

  // Protein and fat are anchored to bodyweight; carbs absorb whatever energy is
  // left. If that remainder goes negative (very low target, very heavy person),
  // trim fat down to its floor before touching protein — protein is the macro
  // doing the muscle-sparing work.
  const proteinG = Math.round(GOAL_PROTEIN_PER_KG[goal] * weightKg);
  let fatG = Math.round(Math.max(FAT_PER_KG_FLOOR * weightKg, (targetKcal * 0.25) / KCAL_PER_G.fat));

  const proteinKcal = proteinG * KCAL_PER_G.protein;
  let remainingKcal = targetKcal - proteinKcal - fatG * KCAL_PER_G.fat;

  if (remainingKcal < 0) {
    fatG = Math.round((FAT_PER_KG_FLOOR * weightKg));
    remainingKcal = targetKcal - proteinKcal - fatG * KCAL_PER_G.fat;
  }

  const carbsG = Math.max(0, Math.round(remainingKcal / KCAL_PER_G.carbs));

  return { bmr, tdee, targetKcal, proteinG, carbsG, fatG, wasClamped, clampReason };
}

/**
 * Validate a calorie target that came back from the AI.
 *
 * Structured outputs guarantee the *shape* of the model's response, never the
 * *values* — and the SDK's Zod helper strips numeric constraints before sending
 * the schema, so `.min()`/`.max()` are client-side checks only. Anything
 * safety-critical has to be re-checked here, on our side, before it is stored.
 */
export function isCalorieTargetSafe(
  targetKcal: number,
  tdee: number,
  sex: Sex,
): { safe: boolean; reason?: string } {
  if (targetKcal < CALORIE_FLOOR[sex]) {
    return {
      safe: false,
      reason: `Target ${targetKcal} kcal is below the ${CALORIE_FLOOR[sex]} kcal floor.`,
    };
  }
  if (targetKcal < tdee * (1 - MAX_DEFICIT_FRACTION)) {
    return {
      safe: false,
      reason: `Target ${targetKcal} kcal is more than ${MAX_DEFICIT_FRACTION * 100}% below maintenance (${tdee} kcal).`,
    };
  }
  if (targetKcal > tdee * (1 + MAX_SURPLUS_FRACTION)) {
    return {
      safe: false,
      reason: `Target ${targetKcal} kcal is more than ${MAX_SURPLUS_FRACTION * 100}% above maintenance (${tdee} kcal).`,
    };
  }
  return { safe: true };
}

/** Estimated one-rep max (Epley). Meaningless above ~12 reps, so we cap it. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  const cappedReps = Math.min(reps, 12);
  return Math.round(weightKg * (1 + cappedReps / 30) * 10) / 10;
}

/** Total volume load for a set collection: sum of weight x reps. */
export function calculateVolume(
  sets: Array<{ weight_kg: number | null; reps: number | null }>,
): number {
  return sets.reduce(
    (total, set) => total + (set.weight_kg ?? 0) * (set.reps ?? 0),
    0,
  );
}

/** Body mass index, for display only — never used to drive a prescription. */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}
