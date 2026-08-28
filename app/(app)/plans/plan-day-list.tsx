"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import type { PlanDayWithExercises } from "@/lib/db/workouts";
import { startSessionAction } from "./actions";

export function PlanDayList({ days }: { days: PlanDayWithExercises[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Which day is starting, so only that button shows a pending state rather
  // than every button on the page going grey at once.
  const [startingId, setStartingId] = useState<string | null>(null);

  function handleStart(day: PlanDayWithExercises) {
    setError(null);
    setStartingId(day.id);
    startTransition(async () => {
      const result = await startSessionAction({
        name: day.name,
        planDayId: day.id,
      });
      setStartingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {days.map((day) => (
        <section key={day.id} className="card overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                Day {day.day_index + 1} · {day.name}
              </h2>
              {day.focus && (
                <p className="truncate text-xs text-muted">{day.focus}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleStart(day)}
              disabled={pending}
              className="btn-primary shrink-0 text-xs"
            >
              <span className="flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" aria-hidden />
                {startingId === day.id ? "Starting…" : "Start"}
              </span>
            </button>
          </header>

          <ul className="divide-y divide-line">
            {day.plan_exercises.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">
                    {item.exercise?.name ?? "Exercise"}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {item.target_sets} × {item.target_reps}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-faint">
                  {item.exercise?.primary_muscle} · {item.rest_seconds}s rest
                </p>
                {item.notes && (
                  <p className="mt-1 text-xs text-muted">{item.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
