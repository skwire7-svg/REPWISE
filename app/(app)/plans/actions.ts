"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateWorkoutPlan } from "@/lib/ai/workout-plan";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/profile";
import {
  deleteSet,
  endSession,
  getExercises,
  logSet,
  saveGeneratedPlan,
  startSession,
} from "@/lib/db/workouts";
import { isCompleteProfile } from "@/lib/types/database";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Generates a plan from the user's profile and stores it.
 *
 * The exercise library is filtered to the user's equipment before it reaches
 * the model, so a home user is never offered a cable machine — the filter is a
 * hard constraint here, not a hint in the prompt.
 */
export async function generatePlanAction(): Promise<ActionResult> {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) {
    return { ok: false, error: "Finish onboarding first." };
  }

  const library = await getExercises(profile.available_equipment);

  const generated = await generateWorkoutPlan(profile, library);
  if (!generated.ok) return generated;

  const saved = await saveGeneratedPlan(user.id, generated.plan);
  if (!saved.ok) return saved;

  revalidatePath("/plans");
  revalidatePath("/dashboard");
  return { ok: true };
}

const StartSessionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  planDayId: z.string().uuid().nullable(),
});

export async function startSessionAction(input: {
  name: string;
  planDayId: string | null;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const parsed = StartSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid session details." };

  const user = await requireUser();
  const result = await startSession(user.id, parsed.data.name, parsed.data.planDayId);

  if (result.ok) {
    revalidatePath("/plans");
    revalidatePath("/dashboard");
  }
  return result;
}

const LogSetSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  setNumber: z.coerce.number().int().min(1).max(50),
  // Wide but finite bounds: the check constraints in the schema reject
  // anything outside these, and a clear message beats a Postgres error.
  weightKg: z.coerce.number().min(0).max(1000).nullable(),
  reps: z.coerce.number().int().min(0).max(500).nullable(),
  rpe: z.coerce.number().min(1).max(10).nullable(),
});

/**
 * What a form actually sends: number inputs hand back strings.
 *
 * Declared by hand rather than as `z.input<typeof LogSetSchema>` because
 * `z.coerce.number()` reports its *output* type as the input type, so the
 * inferred type claims to want numbers the form will never produce.
 */
export interface LogSetInput {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: string | number | null;
  reps: string | number | null;
  rpe: string | number | null;
}

export async function logSetAction(input: LogSetInput): Promise<ActionResult> {
  const parsed = LogSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid set." };
  }

  await requireUser();
  const result = await logSet(parsed.data);

  if (result.ok) {
    revalidatePath("/plans");
    revalidatePath("/progress");
  }
  return result;
}

export async function deleteSetAction(setId: string): Promise<ActionResult> {
  await requireUser();
  const result = await deleteSet(setId);
  if (result.ok) revalidatePath("/plans");
  return result;
}

export async function endSessionAction(
  sessionId: string,
  notes: string,
): Promise<ActionResult> {
  await requireUser();
  const result = await endSession(sessionId, notes.trim() || null);

  if (result.ok) {
    revalidatePath("/plans");
    revalidatePath("/dashboard");
    revalidatePath("/progress");
  }
  return result;
}
