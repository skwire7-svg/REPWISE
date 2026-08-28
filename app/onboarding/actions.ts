"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth/session";

/**
 * Server-side validation of the onboarding wizard.
 *
 * The client validates too, for fast feedback — but that validation is a UX
 * affordance, not a security boundary. Anyone can POST directly to a server
 * action, so these bounds are the ones that actually hold. They are deliberately
 * wide (real humans exist at the edges) but exclude values that would produce
 * a nonsensical BMR, such as a 20 kg adult or a 300-year-old.
 */
const OnboardingSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-() ]*$/, "Phone can only contain digits and + - ( )")
    .optional()
    .or(z.literal("")),
  date_of_birth: z.string().refine((value) => {
    const dob = new Date(value);
    if (Number.isNaN(dob.getTime())) return false;
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= 13 && age <= 100;
  }, "Enter a date of birth between 13 and 100 years ago"),
  sex: z.enum(["male", "female", "other"]),
  height_cm: z.coerce.number().min(100).max(250),
  weight_kg: z.coerce.number().min(30).max(300),
  activity_level: z.enum([
    "sedentary",
    "light",
    "moderate",
    "active",
    "very_active",
  ]),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  goal: z.enum(["lose_fat", "build_muscle", "gain_strength", "stay_fit"]),
  training_location: z.enum(["home", "gym"]),
  days_per_week: z.coerce.number().int().min(1).max(7),
  available_equipment: z
    .array(
      z.enum([
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
      ]),
    )
    .min(1, "Pick at least one equipment option"),
  dietary_preference: z.string().trim().max(80).optional().or(z.literal("")),
  allergies: z.array(z.string().trim().max(60)).max(20),
  injuries: z.string().trim().max(500).optional().or(z.literal("")),
});

export type OnboardingInput = z.input<typeof OnboardingSchema>;

export type OnboardingResult = { ok: false; error: string };

/**
 * Persists the profile and marks onboarding complete.
 *
 * On success this redirects and never returns — so the caller only ever
 * receives a value in the failure case.
 */
export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const user = await getAuthedUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Please log in again." };
  }

  const data = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

  const patch = {
    full_name: data.full_name,
    phone: data.phone || null,
    date_of_birth: data.date_of_birth,
    sex: data.sex,
    height_cm: data.height_cm,
    weight_kg: data.weight_kg,
    activity_level: data.activity_level,
    experience_level: data.experience_level,
    goal: data.goal,
    training_location: data.training_location,
    days_per_week: data.days_per_week,
    available_equipment: data.available_equipment,
    dietary_preference: data.dietary_preference || null,
    allergies: data.allergies.filter(Boolean),
    injuries: data.injuries || null,
    onboarding_completed: true,
  };

  const supabase = await createClient();

  // upsert, not update: the handle_new_user() trigger normally creates the row
  // at signup, but a user whose account predates that trigger would otherwise
  // silently update zero rows and land on a dashboard with no profile.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...patch }, { onConflict: "id" });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Seed the bodyweight chart with the starting weight, so the progress graph
  // has a first point instead of being empty until the user logs manually.
  const { error: weightError } = await supabase.from("weight_logs").upsert(
    { user_id: user.id, weight_kg: data.weight_kg, logged_on: today },
    { onConflict: "user_id,logged_on" },
  );

  if (weightError) {
    return { ok: false, error: weightError.message };
  }

  // The layout reads onboarding_completed to decide whether to bounce back
  // here; without this the cached shell can redirect straight to /onboarding.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
