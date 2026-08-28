/**
 * Progress data: bodyweight, tape measurements, personal records and training
 * volume.
 *
 * Aggregation happens in TypeScript rather than in SQL views. The data volumes
 * here are per-user and small (a year of daily logs is a few hundred rows), and
 * keeping the maths next to the chart that renders it is far easier to follow
 * than a view that has to be migrated whenever the chart changes.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  BodyMeasurement,
  PersonalRecord,
  WeightLog,
} from "@/lib/types/database";

// --- Bodyweight -------------------------------------------------------------

export async function getWeightLogs(
  userId: string,
  limit = 180,
): Promise<WeightLog[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("weight_logs")
    .select("*")
    .eq("user_id", userId)
    .order("logged_on", { ascending: false })
    .limit(limit);

  // Fetched newest-first so the limit keeps the *recent* window, then reversed
  // because charts read left-to-right in time order.
  return (data ?? []).reverse() as WeightLog[];
}

export async function logWeight(
  userId: string,
  weightKg: number,
  loggedOn: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // One row per user per day — re-weighing in the evening corrects the morning
  // entry rather than adding a second point to the same day on the chart.
  const { error } = await supabase
    .from("weight_logs")
    .upsert(
      { user_id: userId, weight_kg: weightKg, logged_on: loggedOn },
      { onConflict: "user_id,logged_on" },
    );

  if (error) return { ok: false, error: error.message };

  // The profile's weight drives every calorie and macro target, so it has to
  // follow the scale — otherwise targets stay pinned to the signup weight.
  await supabase
    .from("profiles")
    .update({ weight_kg: weightKg })
    .eq("id", userId);

  return { ok: true };
}

// --- Tape measurements ------------------------------------------------------

export async function getMeasurements(
  userId: string,
  limit = 60,
): Promise<BodyMeasurement[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .order("logged_on", { ascending: false })
    .limit(limit);

  return (data ?? []) as BodyMeasurement[];
}

export async function logMeasurement(
  userId: string,
  loggedOn: string,
  values: Partial<Omit<BodyMeasurement, "id" | "user_id" | "created_at" | "logged_on">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("body_measurements")
    .upsert(
      { user_id: userId, logged_on: loggedOn, ...values },
      { onConflict: "user_id,logged_on" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// --- Personal records -------------------------------------------------------

export interface PersonalRecordWithExercise extends PersonalRecord {
  exercise: { id: string; name: string; slug: string; primary_muscle: string } | null;
}

/**
 * Best lift per exercise, heaviest estimated 1RM first.
 *
 * Rows are written by the `set_logs_record_pr` trigger, not by the app, so this
 * is purely a read — logging a set is all it takes to earn a PR.
 */
export async function getPersonalRecords(
  userId: string,
  limit = 20,
): Promise<PersonalRecordWithExercise[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("personal_records")
    .select("*, exercise:exercises(id, name, slug, primary_muscle)")
    .eq("user_id", userId)
    .order("est_one_rep_max", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as PersonalRecordWithExercise[];
}

// --- Training volume --------------------------------------------------------

export interface WeeklyVolume {
  /** ISO date of the Monday that starts the week. */
  weekStart: string;
  volumeKg: number;
  sessions: number;
  sets: number;
}

interface VolumeRow {
  started_at: string;
  set_logs: Array<{ weight_kg: number | null; reps: number | null; completed: boolean }>;
}

/** Monday of the week containing `date`, as an ISO date string. */
function weekStartOf(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay() is 0 for Sunday, which belongs to the week that began six days
  // earlier — not to the one starting the next day.
  const dayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return d.toISOString().slice(0, 10);
}

/**
 * Volume load (weight x reps) per week over the last `weeks` weeks.
 *
 * Weeks with no training are returned as explicit zero rows rather than being
 * omitted, so a gap renders as a dip in the chart instead of two adjacent bars
 * that quietly hide a month off.
 */
export async function getWeeklyVolume(
  userId: string,
  weeks = 12,
): Promise<WeeklyVolume[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - weeks * 7);

  const { data } = await supabase
    .from("workout_sessions")
    .select("started_at, set_logs(weight_kg, reps, completed)")
    .eq("user_id", userId)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: true });

  const rows = (data ?? []) as unknown as VolumeRow[];

  const buckets = new Map<string, WeeklyVolume>();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i * 7);
    const key = weekStartOf(d);
    buckets.set(key, { weekStart: key, volumeKg: 0, sessions: 0, sets: 0 });
  }

  for (const session of rows) {
    const key = weekStartOf(new Date(session.started_at));
    const bucket = buckets.get(key);
    if (!bucket) continue; // session older than the window's first Monday

    bucket.sessions += 1;
    for (const set of session.set_logs ?? []) {
      if (!set.completed) continue;
      bucket.sets += 1;
      bucket.volumeKg += (set.weight_kg ?? 0) * (set.reps ?? 0);
    }
  }

  return [...buckets.values()].map((b) => ({
    ...b,
    volumeKg: Math.round(b.volumeKg),
  }));
}
