/**
 * Types mirroring supabase/migrations/0001_init.sql.
 *
 * Hand-written rather than generated so the project has no codegen step to run
 * before it compiles. If you later prefer generation:
 *   npx supabase gen types typescript --project-id <ref> > lib/types/database.ts
 * Keep the exported names below stable — the rest of the app imports from here.
 */

// --- Enums (must match the Postgres enum types exactly) ---------------------

export type Sex = "male" | "female" | "other";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type FitnessGoal =
  | "lose_fat"
  | "build_muscle"
  | "gain_strength"
  | "stay_fit";

export type TrainingLocation = "home" | "gym";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type ChatRole = "user" | "assistant";

export type EquipmentType =
  | "bodyweight"
  | "dumbbell"
  | "barbell"
  | "kettlebell"
  | "resistance_band"
  | "pull_up_bar"
  | "bench"
  | "machine"
  | "cable"
  | "medicine_ball";

/** Equipment a user can realistically own at home, used to gate plan choices. */
export const HOME_EQUIPMENT: readonly EquipmentType[] = [
  "bodyweight",
  "dumbbell",
  "kettlebell",
  "resistance_band",
  "pull_up_bar",
  "bench",
  "medicine_ball",
] as const;

/** Everything a commercial gym is assumed to have. */
export const GYM_EQUIPMENT: readonly EquipmentType[] = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "resistance_band",
  "pull_up_bar",
  "bench",
  "machine",
  "cable",
  "medicine_ball",
] as const;

// --- Row types --------------------------------------------------------------

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  experience_level: ExperienceLevel | null;
  goal: FitnessGoal | null;
  training_location: TrainingLocation | null;
  available_equipment: EquipmentType[];
  days_per_week: number | null;
  activity_level: ActivityLevel | null;
  dietary_preference: string | null;
  allergies: string[];
  injuries: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A profile with every field the AI generators require proven non-null.
 * Narrow with `isCompleteProfile` before building a generation request — it
 * turns "did onboarding fill this in?" into a compile-time question.
 */
export type CompleteProfile = Profile & {
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  date_of_birth: string;
  experience_level: ExperienceLevel;
  goal: FitnessGoal;
  training_location: TrainingLocation;
  days_per_week: number;
  activity_level: ActivityLevel;
};

export function isCompleteProfile(p: Profile): p is CompleteProfile {
  return (
    p.sex !== null &&
    p.height_cm !== null &&
    p.weight_kg !== null &&
    p.date_of_birth !== null &&
    p.experience_level !== null &&
    p.goal !== null &&
    p.training_location !== null &&
    p.days_per_week !== null &&
    p.activity_level !== null
  );
}

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: EquipmentType;
  is_bodyweight: boolean;
  is_compound: boolean;
  difficulty: ExperienceLevel;
  instructions: string | null;
  created_at: string;
}

export interface WorkoutPlan {
  id: string;
  user_id: string;
  name: string;
  goal: FitnessGoal;
  location: TrainingLocation;
  days_per_week: number;
  summary: string | null;
  is_active: boolean;
  generated_at: string;
}

export interface PlanDay {
  id: string;
  plan_id: string;
  day_index: number;
  name: string;
  focus: string | null;
}

export interface PlanExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
  notes: string | null;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  plan_day_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

export interface SetLog {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  logged_at: string;
}

export interface DietPlan {
  id: string;
  user_id: string;
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  summary: string | null;
  is_active: boolean;
  generated_at: string;
}

export interface DietPlanMeal {
  id: string;
  diet_plan_id: string;
  meal_type: MealType;
  position: number;
  name: string;
  description: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealLog {
  id: string;
  user_id: string;
  logged_on: string;
  meal_type: MealType;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_on: string;
}

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  /** Model that produced an assistant turn; null for user turns. */
  model: string | null;
  created_at: string;
}

export interface BodyMeasurement {
  id: string;
  user_id: string;
  logged_on: string;
  body_fat_pct: number | null;
  neck_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  left_arm_cm: number | null;
  right_arm_cm: number | null;
  left_thigh_cm: number | null;
  right_thigh_cm: number | null;
  notes: string | null;
  created_at: string;
}

/** The measurable sites, in the order the Progress form lists them. */
export const MEASUREMENT_SITES = [
  { key: "neck_cm", label: "Neck" },
  { key: "chest_cm", label: "Chest" },
  { key: "waist_cm", label: "Waist" },
  { key: "hips_cm", label: "Hips" },
  { key: "left_arm_cm", label: "Left arm" },
  { key: "right_arm_cm", label: "Right arm" },
  { key: "left_thigh_cm", label: "Left thigh" },
  { key: "right_thigh_cm", label: "Right thigh" },
] as const satisfies ReadonlyArray<{
  key: keyof BodyMeasurement;
  label: string;
}>;

export type MeasurementSiteKey = (typeof MEASUREMENT_SITES)[number]["key"];

export interface PersonalRecord {
  id: string;
  user_id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  est_one_rep_max: number;
  set_log_id: string | null;
  achieved_on: string;
  created_at: string;
}

// --- Display labels ---------------------------------------------------------

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose_fat: "Lose fat",
  build_muscle: "Build muscle",
  gain_strength: "Gain strength",
  stay_fit: "Stay fit",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner — new to training",
  intermediate: "Intermediate — training consistently for 6+ months",
  advanced: "Advanced — years of structured training",
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary — desk job, little movement",
  light: "Light — light exercise 1-3 days a week",
  moderate: "Moderate — exercise 3-5 days a week",
  active: "Active — hard exercise 6-7 days a week",
  very_active: "Very active — physical job or two-a-day training",
};

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  bodyweight: "Bodyweight only",
  dumbbell: "Dumbbells",
  barbell: "Barbell & plates",
  kettlebell: "Kettlebell",
  resistance_band: "Resistance bands",
  pull_up_bar: "Pull-up bar",
  bench: "Bench",
  machine: "Machines",
  cable: "Cable machine",
  medicine_ball: "Medicine ball",
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};
