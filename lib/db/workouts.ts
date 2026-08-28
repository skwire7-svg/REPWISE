/**
 * Workout plans, sessions and set logging.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Exercise,
  EquipmentType,
  FitnessGoal,
  PlanDay,
  PlanExercise,
  TrainingLocation,
  WorkoutPlan,
  WorkoutSession,
} from "@/lib/types/database";

// --- Exercise library -------------------------------------------------------

/**
 * The exercise library, optionally narrowed to what the user can actually
 * train with. Passing no equipment returns everything.
 */
export async function getExercises(
  equipment?: readonly EquipmentType[],
): Promise<Exercise[]> {
  const supabase = await createClient();

  let query = supabase.from("exercises").select("*").order("name");
  if (equipment && equipment.length > 0) {
    query = query.in("equipment", equipment as EquipmentType[]);
  }

  const { data } = await query;
  return (data ?? []) as Exercise[];
}

// --- Plans ------------------------------------------------------------------

export interface PlanExerciseWithExercise extends PlanExercise {
  exercise: Exercise | null;
}

export interface PlanDayWithExercises extends PlanDay {
  plan_exercises: PlanExerciseWithExercise[];
}

export interface FullWorkoutPlan extends WorkoutPlan {
  plan_days: PlanDayWithExercises[];
}

/**
 * The user's active plan with days and exercises, or null.
 *
 * One nested select rather than three round trips — PostgREST resolves the
 * embedded resources through the foreign keys, and RLS still applies at every
 * level because each child table has its own walk-up-to-the-parent policy.
 */
export async function getActivePlan(
  userId: string,
): Promise<FullWorkoutPlan | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_plans")
    .select(
      `*, plan_days(*, plan_exercises(*, exercise:exercises(*)))`,
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const plan = data as unknown as FullWorkoutPlan;

  // PostgREST does not order embedded rows, so a plan would otherwise render
  // its days and exercises in whatever order the rows came back in.
  plan.plan_days.sort((a, b) => a.day_index - b.day_index);
  for (const day of plan.plan_days) {
    day.plan_exercises.sort((a, b) => a.position - b.position);
  }

  return plan;
}

export interface GeneratedPlanInput {
  name: string;
  goal: FitnessGoal;
  location: TrainingLocation;
  daysPerWeek: number;
  summary: string;
  days: Array<{
    name: string;
    focus: string;
    exercises: Array<{
      exerciseId: string;
      targetSets: number;
      targetReps: string;
      restSeconds: number;
      notes?: string;
    }>;
  }>;
}

/**
 * Stores a freshly generated plan and makes it the active one.
 *
 * Postgres has no cross-statement transaction over PostgREST, so the writes are
 * ordered to fail safe: the new plan is fully built *before* the old one is
 * deactivated. A failure partway through leaves the previous plan active and an
 * orphaned inactive draft behind, which is invisible to the user — the reverse
 * order would leave them with no plan at all.
 */
export async function saveGeneratedPlan(
  userId: string,
  input: GeneratedPlanInput,
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: plan, error: planError } = await supabase
    .from("workout_plans")
    .insert({
      user_id: userId,
      name: input.name,
      goal: input.goal,
      location: input.location,
      days_per_week: input.daysPerWeek,
      summary: input.summary,
      is_active: false,
    })
    .select("id")
    .single<{ id: string }>();

  if (planError || !plan) {
    return { ok: false, error: planError?.message ?? "Could not create the plan." };
  }

  const { data: days, error: daysError } = await supabase
    .from("plan_days")
    .insert(
      input.days.map((day, index) => ({
        plan_id: plan.id,
        day_index: index,
        name: day.name,
        focus: day.focus,
      })),
    )
    .select("id, day_index");

  if (daysError || !days) {
    return { ok: false, error: daysError?.message ?? "Could not create plan days." };
  }

  const dayIdByIndex = new Map<number, string>(
    (days as Array<{ id: string; day_index: number }>).map((d) => [d.day_index, d.id]),
  );

  const exerciseRows = input.days.flatMap((day, dayIndex) =>
    day.exercises.map((ex, position) => ({
      plan_day_id: dayIdByIndex.get(dayIndex)!,
      exercise_id: ex.exerciseId,
      position,
      target_sets: ex.targetSets,
      target_reps: ex.targetReps,
      rest_seconds: ex.restSeconds,
      notes: ex.notes ?? null,
    })),
  );

  if (exerciseRows.length > 0) {
    const { error: exError } = await supabase
      .from("plan_exercises")
      .insert(exerciseRows);

    if (exError) {
      return { ok: false, error: exError.message };
    }
  }

  // Only now is the new plan complete enough to hand over to.
  await supabase
    .from("workout_plans")
    .update({ is_active: false })
    .eq("user_id", userId)
    .neq("id", plan.id);

  const { error: activateError } = await supabase
    .from("workout_plans")
    .update({ is_active: true })
    .eq("id", plan.id);

  if (activateError) {
    return { ok: false, error: activateError.message };
  }

  return { ok: true, planId: plan.id };
}

// --- Sessions and set logging ----------------------------------------------

export interface SetLogRow {
  id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  logged_at: string;
}

export interface SessionWithSets extends WorkoutSession {
  set_logs: SetLogRow[];
}

export async function getSession(
  sessionId: string,
): Promise<SessionWithSets | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_sessions")
    .select("*, set_logs(*)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!data) return null;

  const session = data as unknown as SessionWithSets;
  session.set_logs.sort((a, b) => a.set_number - b.set_number);
  return session;
}

/** The session the user is part-way through, if any. */
export async function getOpenSession(
  userId: string,
): Promise<SessionWithSets | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_sessions")
    .select("*, set_logs(*)")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as unknown as SessionWithSets) ?? null;
}

export async function getRecentSessions(
  userId: string,
  limit = 10,
): Promise<SessionWithSets[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_sessions")
    .select("*, set_logs(*)")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as SessionWithSets[];
}

export async function startSession(
  userId: string,
  name: string,
  planDayId: string | null,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({ user_id: userId, name, plan_day_id: planDayId })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not start the session." };
  }
  return { ok: true, sessionId: data.id };
}

export async function logSet(input: {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // Upsert on the natural key so correcting a set the user just typed updates
  // it in place instead of appending a duplicate set number.
  const { error } = await supabase.from("set_logs").upsert(
    {
      session_id: input.sessionId,
      exercise_id: input.exerciseId,
      set_number: input.setNumber,
      weight_kg: input.weightKg,
      reps: input.reps,
      rpe: input.rpe,
      completed: true,
    },
    { onConflict: "session_id,exercise_id,set_number" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteSet(
  setId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("set_logs").delete().eq("id", setId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function endSession(
  sessionId: string,
  notes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("workout_sessions")
    .update({ ended_at: new Date().toISOString(), notes })
    .eq("id", sessionId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
