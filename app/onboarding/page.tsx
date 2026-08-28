"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { completeOnboarding, type OnboardingInput } from "./actions";
import {
  ACTIVITY_LABELS,
  EQUIPMENT_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  GYM_EQUIPMENT,
  HOME_EQUIPMENT,
  type ActivityLevel,
  type EquipmentType,
  type ExperienceLevel,
  type FitnessGoal,
  type Sex,
  type TrainingLocation,
} from "@/lib/types/database";
import { calculateAge, calculateMacroTargets } from "@/lib/fitness/metrics";
import { cn } from "@/lib/utils";

const STEPS = ["About you", "Your body", "Training", "Equipment", "Nutrition"] as const;

type FormState = {
  full_name: string;
  phone: string;
  date_of_birth: string;
  sex: Sex | "";
  height_cm: string;
  weight_kg: string;
  activity_level: ActivityLevel | "";
  experience_level: ExperienceLevel | "";
  goal: FitnessGoal | "";
  training_location: TrainingLocation | "";
  days_per_week: number;
  available_equipment: EquipmentType[];
  dietary_preference: string;
  allergies: string;
  injuries: string;
};

const INITIAL: FormState = {
  full_name: "",
  phone: "",
  date_of_birth: "",
  sex: "",
  height_cm: "",
  weight_kg: "",
  activity_level: "",
  experience_level: "",
  goal: "",
  training_location: "",
  days_per_week: 4,
  available_equipment: [],
  dietary_preference: "",
  allergies: "",
  injuries: "",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  // Equipment on offer follows the training location — showing cable machines
  // to someone training in their living room produces plans they can't do.
  const equipmentOptions = useMemo<readonly EquipmentType[]>(() => {
    if (form.training_location === "gym") return GYM_EQUIPMENT;
    if (form.training_location === "home") return HOME_EQUIPMENT;
    return HOME_EQUIPMENT;
  }, [form.training_location]);

  // Live preview of what their numbers imply, shown on the final step. Uses the
  // same function the diet generator will use, so what they see is what they get.
  const preview = useMemo(() => {
    if (
      !form.sex ||
      !form.height_cm ||
      !form.weight_kg ||
      !form.date_of_birth ||
      !form.activity_level ||
      !form.goal
    ) {
      return null;
    }
    try {
      return calculateMacroTargets({
        sex: form.sex,
        heightCm: Number(form.height_cm),
        weightKg: Number(form.weight_kg),
        age: calculateAge(form.date_of_birth),
        activityLevel: form.activity_level,
        goal: form.goal,
      });
    } catch {
      return null;
    }
  }, [form]);

  function validateStep(index: number): string | null {
    switch (index) {
      case 0:
        if (!form.full_name.trim()) return "Please enter your name.";
        if (!form.date_of_birth) return "Please enter your date of birth.";
        if (!form.sex) return "Please select an option.";
        return null;
      case 1:
        if (!form.height_cm) return "Please enter your height.";
        if (!form.weight_kg) return "Please enter your weight.";
        if (!form.activity_level) return "Please choose your activity level.";
        return null;
      case 2:
        if (!form.experience_level) return "Please choose your experience level.";
        if (!form.goal) return "Please choose your goal.";
        if (!form.training_location) return "Please choose where you'll train.";
        return null;
      case 3:
        if (form.available_equipment.length === 0)
          return "Select at least one equipment option.";
        return null;
      default:
        return null;
    }
  }

  function next() {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    for (let i = 0; i < STEPS.length; i += 1) {
      const problem = validateStep(i);
      if (problem) {
        setStep(i);
        setError(problem);
        return;
      }
    }

    setPending(true);
    setError(null);

    const payload: OnboardingInput = {
      full_name: form.full_name,
      phone: form.phone,
      date_of_birth: form.date_of_birth,
      sex: form.sex as Sex,
      // The schema coerces, but its inferred input type is number — convert
      // here so the wizard's string-backed inputs typecheck.
      height_cm: Number(form.height_cm),
      weight_kg: Number(form.weight_kg),
      activity_level: form.activity_level as ActivityLevel,
      experience_level: form.experience_level as ExperienceLevel,
      goal: form.goal as FitnessGoal,
      training_location: form.training_location as TrainingLocation,
      days_per_week: form.days_per_week,
      available_equipment: form.available_equipment,
      dietary_preference: form.dietary_preference,
      allergies: form.allergies
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      injuries: form.injuries,
    };

    // On success this redirects and never returns; only failures come back.
    const result = await completeOnboarding(payload);
    setPending(false);
    if (result && !result.ok) setError(result.error);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <span className="text-xl font-bold tracking-tight">
        Rep<span className="text-accent">wise</span>
      </span>

      <ol className="mt-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-2">
            <div
              className={cn(
                "h-1 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-line",
              )}
            />
            <span
              className={cn(
                "hidden text-xs sm:block",
                i === step ? "text-content" : "text-faint",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="card mt-8 p-6 sm:p-8">
        {step === 0 && (
          <Section
            title="About you"
            hint="We use your age and sex in the calorie equation — both change the result meaningfully."
          >
            <Field label="Full name">
              <input
                className="field"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Phone number" optional>
              <input
                className="field"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                className="field"
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Sex">
              <Choices
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                  { value: "other", label: "Prefer not to say" },
                ]}
                value={form.sex}
                onChange={(v) => set("sex", v as Sex)}
              />
              <p className="mt-2 text-xs text-faint">
                &quot;Prefer not to say&quot; averages the male and female
                constants rather than assuming one.
              </p>
            </Field>
          </Section>
        )}

        {step === 1 && (
          <Section
            title="Your body"
            hint="These drive your calorie and macro targets. You can update them any time."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Height (cm)">
                <input
                  type="number"
                  className="field"
                  value={form.height_cm}
                  onChange={(e) => set("height_cm", e.target.value)}
                  min={100}
                  max={250}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Weight (kg)">
                <input
                  type="number"
                  className="field"
                  value={form.weight_kg}
                  onChange={(e) => set("weight_kg", e.target.value)}
                  min={30}
                  max={300}
                  step="0.1"
                  inputMode="decimal"
                />
              </Field>
            </div>
            <Field label="Day-to-day activity level">
              <Choices
                stacked
                options={(
                  Object.keys(ACTIVITY_LABELS) as ActivityLevel[]
                ).map((value) => ({ value, label: ACTIVITY_LABELS[value] }))}
                value={form.activity_level}
                onChange={(v) => set("activity_level", v as ActivityLevel)}
              />
              <p className="mt-2 text-xs text-faint">
                This is life outside your workouts — your job, commute and daily
                movement. Training is accounted for separately.
              </p>
            </Field>
          </Section>
        )}

        {step === 2 && (
          <Section
            title="Training"
            hint="Where you train decides which exercises we can prescribe."
          >
            <Field label="Experience level">
              <Choices
                stacked
                options={(
                  Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]
                ).map((value) => ({ value, label: EXPERIENCE_LABELS[value] }))}
                value={form.experience_level}
                onChange={(v) => set("experience_level", v as ExperienceLevel)}
              />
            </Field>
            <Field label="Primary goal">
              <Choices
                options={(Object.keys(GOAL_LABELS) as FitnessGoal[]).map(
                  (value) => ({ value, label: GOAL_LABELS[value] }),
                )}
                value={form.goal}
                onChange={(v) => set("goal", v as FitnessGoal)}
              />
            </Field>
            <Field label="Where will you train?">
              <Choices
                options={[
                  { value: "home", label: "At home" },
                  { value: "gym", label: "At a gym" },
                ]}
                value={form.training_location}
                onChange={(v) => {
                  set("training_location", v as TrainingLocation);
                  // Equipment choices differ by location, so clear any
                  // selections that no longer apply.
                  set("available_equipment", []);
                }}
              />
            </Field>
            <Field label={`Days per week: ${form.days_per_week}`}>
              <input
                type="range"
                min={1}
                max={7}
                value={form.days_per_week}
                onChange={(e) => set("days_per_week", Number(e.target.value))}
                className="w-full accent-accent"
              />
            </Field>
          </Section>
        )}

        {step === 3 && (
          <Section
            title="Equipment"
            hint="Pick everything you can actually get to. Plans only use what you select."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {equipmentOptions.map((item) => {
                const checked = form.available_equipment.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      set(
                        "available_equipment",
                        checked
                          ? form.available_equipment.filter((e) => e !== item)
                          : [...form.available_equipment, item],
                      )
                    }
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      checked
                        ? "border-accent bg-accent-dim/30 text-content"
                        : "border-line bg-surface-2 text-muted hover:border-faint",
                    )}
                  >
                    {EQUIPMENT_LABELS[item]}
                    {checked && <Check className="h-4 w-4 text-accent" />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section
            title="Nutrition & health"
            hint="Optional, but it makes the diet plan and the coach far more useful."
          >
            <Field label="Dietary preference" optional>
              <input
                className="field"
                placeholder="e.g. vegetarian, vegan, halal, no preference"
                value={form.dietary_preference}
                onChange={(e) => set("dietary_preference", e.target.value)}
              />
            </Field>
            <Field label="Allergies or foods to avoid" optional>
              <input
                className="field"
                placeholder="peanuts, shellfish, dairy"
                value={form.allergies}
                onChange={(e) => set("allergies", e.target.value)}
              />
              <p className="mt-1.5 text-xs text-faint">Separate with commas.</p>
            </Field>
            <Field label="Injuries or movements to avoid" optional>
              <textarea
                className="field min-h-24 resize-y"
                placeholder="e.g. left knee pain on deep squats, avoid overhead pressing"
                value={form.injuries}
                onChange={(e) => set("injuries", e.target.value)}
              />
            </Field>

            {preview && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <p className="text-sm font-medium">Based on what you told us</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Maintenance" value={`${preview.tdee} kcal`} />
                  <Stat label="Daily target" value={`${preview.targetKcal} kcal`} accent />
                  <Stat label="Protein" value={`${preview.proteinG} g`} />
                  <Stat label="Carbs / Fat" value={`${preview.carbsG} / ${preview.fatG} g`} />
                </div>
                {preview.wasClamped && (
                  <p className="mt-3 text-xs text-warn">
                    Adjusted for safety: {preview.clampReason}
                  </p>
                )}
              </div>
            )}

            <p className="text-xs leading-relaxed text-faint">
              Repwise gives general fitness and nutrition information, not
              medical advice. Talk to a doctor or dietitian before starting a new
              programme, especially with an existing condition or injury.
            </p>
          </Section>
        )}

        {error && (
          <p role="alert" className="mt-6 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || pending}
            className={cn("btn-ghost inline-flex items-center gap-1.5", step === 0 && "invisible")}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="btn-primary inline-flex items-center gap-1.5">
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={pending} className="btn-primary">
              {pending ? "Saving…" : "Finish setup"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// --- Small presentational helpers -------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted">{hint}</p>
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">
        {label}
        {optional && <span className="ml-1.5 text-faint">(optional)</span>}
      </span>
      {children}
    </div>
  );
}

function Choices({
  options,
  value,
  onChange,
  stacked,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  stacked?: boolean;
}) {
  return (
    <div className={cn("gap-2", stacked ? "flex flex-col" : "flex flex-wrap")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm transition-colors",
            stacked ? "text-left" : "",
            value === option.value
              ? "border-accent bg-accent-dim/30 text-content"
              : "border-line bg-surface-2 text-muted hover:border-faint",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className={cn("font-semibold", accent && "text-accent")}>{value}</p>
    </div>
  );
}
