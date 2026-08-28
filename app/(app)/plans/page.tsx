import { redirect } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/profile";
import { getActivePlan, getOpenSession } from "@/lib/db/workouts";
import { isCompleteProfile } from "@/lib/types/database";
import { GeneratePlanButton } from "./generate-plan-button";
import { PlanDayList } from "./plan-day-list";
import { SessionLogger } from "./session-logger";

export default async function PlansPage() {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) redirect("/onboarding");

  const [plan, openSession] = await Promise.all([
    getActivePlan(user.id),
    getOpenSession(user.id),
  ]);

  // A session in progress takes over the page. Someone mid-workout is standing
  // in a gym with one hand free — the plan they're already following is not
  // what they need to look at.
  if (openSession) {
    const day = plan?.plan_days.find((d) => d.id === openSession.plan_day_id);
    return (
      <SessionLogger
        session={openSession}
        exercises={
          day?.plan_exercises.map((pe) => ({
            id: pe.exercise?.id ?? "",
            name: pe.exercise?.name ?? "Exercise",
            targetSets: pe.target_sets,
            targetReps: pe.target_reps,
            restSeconds: pe.rest_seconds,
            notes: pe.notes,
          })) ?? []
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your workout plan</h1>
          <p className="mt-1 text-sm text-muted">
            {plan
              ? `${plan.days_per_week} days a week · ${
                  plan.location === "gym" ? "Gym" : "Home"
                }`
              : "Built from your goal, experience and equipment."}
          </p>
        </div>
        {plan && <GeneratePlanButton label="Regenerate" variant="ghost" />}
      </div>

      {!plan ? (
        <div className="card p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-dim/40">
              <Dumbbell className="h-5 w-5 text-accent" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">No plan yet</p>
              <p className="mt-1 text-sm text-muted">
                Generate a split matched to your goal, experience level and the
                equipment you have. It only prescribes exercises you can actually
                do.
              </p>
              <div className="mt-4">
                <GeneratePlanButton label="Generate my plan" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {plan.summary && (
            <p className="card p-4 text-sm leading-relaxed text-muted">
              {plan.summary}
            </p>
          )}
          <PlanDayList days={plan.plan_days} />
        </>
      )}
    </div>
  );
}
