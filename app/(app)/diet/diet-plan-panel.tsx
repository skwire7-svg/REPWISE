"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { generateDietPlanAction } from "./actions";

interface PlanMeal {
  id: string;
  typeLabel: string;
  name: string;
  description: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function DietPlanPanel({
  plan,
}: {
  plan: { summary: string | null; meals: PlanMeal[] } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateDietPlanAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Suggested meal plan</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="btn-ghost shrink-0 text-xs"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {pending ? "Building…" : plan ? "Regenerate" : "Generate"}
          </span>
        </button>
      </header>

      {error && (
        <p role="alert" className="px-4 pt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!plan ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          Generate a day of meals that hits your targets, respecting your dietary
          preference and allergies.
        </p>
      ) : (
        <>
          {plan.summary && (
            <p className="border-b border-line px-4 py-3 text-sm leading-relaxed text-muted">
              {plan.summary}
            </p>
          )}
          <ul className="divide-y divide-line">
            {plan.meals.map((meal) => (
              <li key={meal.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-accent">
                      {meal.typeLabel}
                    </p>
                    <p className="mt-0.5 text-sm font-medium">{meal.name}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {meal.kcal}
                  </span>
                </div>
                {meal.description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {meal.description}
                  </p>
                )}
                <p className="mt-1 font-mono text-xs text-faint">
                  {meal.proteinG}p {meal.carbsG}c {meal.fatG}f
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
