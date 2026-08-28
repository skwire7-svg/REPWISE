import Link from "next/link";
import { redirect } from "next/navigation";
import { Dumbbell, Salad, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getActiveDietPlan, getMealLogs, sumMeals } from "@/lib/db/diet";
import { getProfile } from "@/lib/db/profile";
import { getActivePlan, getRecentSessions } from "@/lib/db/workouts";
import { calculateAge, calculateBMI, calculateMacroTargets } from "@/lib/fitness/metrics";
import { GOAL_LABELS, isCompleteProfile } from "@/lib/types/database";
import { formatWeight } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile) redirect("/onboarding");

  // Narrows to CompleteProfile, so the metrics call below can't be handed a
  // null height or weight.
  if (!isCompleteProfile(profile)) redirect("/onboarding");

  const targets = calculateMacroTargets({
    sex: profile.sex,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    age: calculateAge(profile.date_of_birth),
    activityLevel: profile.activity_level,
    goal: profile.goal,
  });

  const today = new Date().toISOString().slice(0, 10);

  const [plan, dietPlan, meals, sessions] = await Promise.all([
    getActivePlan(user.id),
    getActiveDietPlan(user.id),
    getMealLogs(user.id, today),
    getRecentSessions(user.id, 30),
  ]);

  const planCount = plan ? 1 : 0;
  const dietCount = dietPlan ? 1 : 0;
  const eaten = sumMeals(meals);

  // Sessions in the last 7 days — a more honest "are you training?" signal
  // than an all-time total, which only ever goes up.
  const weekAgo = new Date();
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const sessionsThisWeek = sessions.filter(
    (session) => new Date(session.started_at) >= weekAgo,
  ).length;

  const firstName = profile.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          {GOAL_LABELS[profile.goal]} &middot; {profile.days_per_week} days a week
          &middot; training at {profile.training_location === "gym" ? "a gym" : "home"}
        </p>
      </div>

      {/* 2 columns on phones rather than 1 — four stacked full-width cards was
          the main source of dead vertical space on the dashboard. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Eaten today"
          value={`${eaten.kcal}`}
          unit={`of ${targets.targetKcal} kcal`}
          accent
        />
        <Metric
          label="Protein today"
          value={`${eaten.proteinG}`}
          unit={`of ${targets.proteinG} g`}
        />
        <Metric
          label="Sessions"
          value={`${sessionsThisWeek}`}
          unit={`of ${profile.days_per_week} this week`}
        />
        <Metric
          label="Weight"
          value={formatWeight(profile.weight_kg)}
          unit={`BMI ${calculateBMI(profile.weight_kg, profile.height_cm)}`}
        />
      </section>

      {targets.wasClamped && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Your target was adjusted for safety: {targets.clampReason}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          icon={Dumbbell}
          title={planCount ? "Your workout plan" : "Build your workout plan"}
          body={
            planCount
              ? "View your split, start a session and log your sets."
              : "Generate a plan matched to your goal, experience and equipment."
          }
          href="/plans"
          cta={planCount ? "Open plan" : "Generate plan"}
        />
        <ActionCard
          icon={Salad}
          title={dietCount ? "Your diet plan" : "Build your diet plan"}
          body={
            dietCount
              ? "Check today's meals and log what you've eaten."
              : `Turn your ${targets.targetKcal} kcal target into meals you'd actually eat.`
          }
          href="/diet"
          cta={dietCount ? "Open diet" : "Generate diet"}
        />
      </section>

      <Link
        href="/coach"
        className="card flex items-center gap-3 p-4 transition-colors hover:border-accent"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Got a question?</h2>
          <p className="text-xs text-muted">
            Ask the coach about form, swaps, or whether to add weight.
          </p>
        </div>
      </Link>

      <p className="border-t border-line pt-4 text-xs leading-relaxed text-faint">
        Repwise provides general fitness and nutrition information and is not
        medical advice. Stop and seek professional guidance if you feel pain.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${accent ? "text-accent" : ""}`}>
        {value}
      </p>
      <p className="truncate text-xs text-muted">{unit}</p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="card flex flex-col p-5">
      <Icon className="h-5 w-5 text-accent" />
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{body}</p>
      <Link href={href} className="btn-ghost mt-4 !py-2 text-center text-sm">
        {cta}
      </Link>
    </div>
  );
}
