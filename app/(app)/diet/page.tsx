import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getActiveDietPlan, getMealLogs, sumMeals } from "@/lib/db/diet";
import { getProfile } from "@/lib/db/profile";
import { calculateAge, calculateMacroTargets } from "@/lib/fitness/metrics";
import { isCompleteProfile, MEAL_TYPE_LABELS } from "@/lib/types/database";
import { DietPlanPanel } from "./diet-plan-panel";
import { MealLogPanel } from "./meal-log-panel";

export default async function DietPage() {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) redirect("/onboarding");

  // The user's own clock, not the server's — logging a 9pm meal shouldn't land
  // on tomorrow because the server runs in UTC.
  const today = new Date().toISOString().slice(0, 10);

  const [plan, meals] = await Promise.all([
    getActiveDietPlan(user.id),
    getMealLogs(user.id, today),
  ]);

  const targets = calculateMacroTargets({
    sex: profile.sex,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    age: calculateAge(profile.date_of_birth),
    activityLevel: profile.activity_level,
    goal: profile.goal,
  });

  const eaten = sumMeals(meals);

  const macros = [
    { label: "Protein", eaten: eaten.proteinG, target: targets.proteinG },
    { label: "Carbs", eaten: eaten.carbsG, target: targets.carbsG },
    { label: "Fat", eaten: eaten.fatG, target: targets.fatG },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your nutrition</h1>
        <p className="mt-1 text-sm text-muted">
          Calculated from your height, weight, age, activity and goal.
        </p>
      </div>

      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Today</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {eaten.kcal}
              <span className="text-base font-medium text-muted">
                {" "}
                / {targets.targetKcal} kcal
              </span>
            </p>
          </div>
          <p className="shrink-0 text-right text-xs text-muted">
            {targets.targetKcal - eaten.kcal > 0
              ? `${targets.targetKcal - eaten.kcal} left`
              : `${eaten.kcal - targets.targetKcal} over`}
          </p>
        </div>

        <Meter value={eaten.kcal} max={targets.targetKcal} className="mt-3" />

        <dl className="mt-5 grid grid-cols-3 gap-4">
          {macros.map((macro) => (
            <div key={macro.label}>
              <dt className="text-xs text-muted">{macro.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {macro.eaten}
                <span className="font-normal text-faint"> / {macro.target} g</span>
              </dd>
              <Meter value={macro.eaten} max={macro.target} className="mt-1.5" />
            </div>
          ))}
        </dl>

        {targets.wasClamped && targets.clampReason && (
          <p className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            {targets.clampReason}
          </p>
        )}
      </section>

      <MealLogPanel meals={meals} loggedOn={today} />

      <DietPlanPanel
        plan={
          plan
            ? {
                summary: plan.summary,
                meals: plan.diet_plan_meals.map((meal) => ({
                  id: meal.id,
                  typeLabel: MEAL_TYPE_LABELS[meal.meal_type],
                  name: meal.name,
                  description: meal.description,
                  kcal: meal.kcal,
                  proteinG: meal.protein_g,
                  carbsG: meal.carbs_g,
                  fatG: meal.fat_g,
                })),
              }
            : null
        }
      />
    </div>
  );
}

/** Fills past 100% stay pinned at full width rather than overflowing the card. */
function Meter({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const over = value > max;

  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`h-full rounded-full ${over ? "bg-warn" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
