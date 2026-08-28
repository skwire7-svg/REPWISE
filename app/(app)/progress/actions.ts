"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { logMeasurement, logWeight } from "@/lib/db/progress";
import type { MeasurementSiteKey } from "@/lib/types/database";

export type ActionResult = { ok: true } | { ok: false; error: string };

const WeightSchema = z.object({
  // Same bounds as onboarding — a value outside these is a typo, not a person.
  weightKg: z.coerce.number().min(30, "That's below 30 kg").max(300, "That's above 300 kg"),
  loggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function logWeightAction(input: {
  weightKg: string | number;
  loggedOn: string;
}): Promise<ActionResult> {
  const parsed = WeightSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid weight." };
  }

  const user = await requireUser();
  const result = await logWeight(user.id, parsed.data.weightKg, parsed.data.loggedOn);

  if (result.ok) {
    // Weight feeds the macro targets, so the diet page changes too.
    revalidatePath("/progress");
    revalidatePath("/dashboard");
    revalidatePath("/diet");
    revalidatePath("/profile");
  }
  return result;
}

/** Optional numeric field: an empty input means "didn't measure", not zero. */
const optionalCm = z
  .union([z.coerce.number().min(1).max(300), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));

const MeasurementSchema = z.object({
  loggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body_fat_pct: z
    .union([z.coerce.number().min(1).max(70), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  neck_cm: optionalCm,
  chest_cm: optionalCm,
  waist_cm: optionalCm,
  hips_cm: optionalCm,
  left_arm_cm: optionalCm,
  right_arm_cm: optionalCm,
  left_thigh_cm: optionalCm,
  right_thigh_cm: optionalCm,
  notes: z.string().trim().max(500).optional(),
});

/**
 * Every site is a string from the form; "" means "didn't measure this one".
 * Declared by hand — see the note in the plans actions on `z.coerce.number()`.
 */
export type LogMeasurementInput = {
  loggedOn: string;
  notes?: string;
} & Partial<Record<MeasurementSiteKey | "body_fat_pct", string | number>>;

export async function logMeasurementAction(
  input: LogMeasurementInput,
): Promise<ActionResult> {
  const parsed = MeasurementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid measurement.",
    };
  }

  const { loggedOn, notes, ...sites } = parsed.data;

  if (Object.values(sites).every((value) => value === null)) {
    return { ok: false, error: "Fill in at least one measurement." };
  }

  const user = await requireUser();
  const result = await logMeasurement(user.id, loggedOn, {
    ...sites,
    notes: notes || null,
  });

  if (result.ok) revalidatePath("/progress");
  return result;
}
