"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { MEAL_TYPE_LABELS, type MealLog, type MealType } from "@/lib/types/database";
import { deleteMealAction, logMealAction } from "./actions";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function MealLogPanel({
  meals,
  loggedOn,
}: {
  meals: MealLog[];
  loggedOn: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    mealType: "breakfast" as MealType,
    name: "",
    kcal: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await logMealAction({
        ...form,
        // Blank macro fields mean "didn't track it", which is zero for the
        // day's totals — only the name is genuinely required.
        kcal: form.kcal || 0,
        proteinG: form.proteinG || 0,
        carbsG: form.carbsG || 0,
        fatG: form.fatG || 0,
        loggedOn,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setForm({
        mealType: form.mealType,
        name: "",
        kcal: "",
        proteinG: "",
        carbsG: "",
        fatG: "",
      });
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteMealAction(id);
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
        <h2 className="text-sm font-semibold">What you ate today</h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="btn-ghost text-xs"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {open ? "Cancel" : "Add meal"}
          </span>
        </button>
      </header>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-3 border-b border-line p-4">
          <div>
            <label className="label" htmlFor="meal-type">
              Meal
            </label>
            <select
              id="meal-type"
              className="field"
              value={form.mealType}
              onChange={(event) =>
                setForm({ ...form, mealType: event.target.value as MealType })
              }
            >
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MEAL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="meal-name">
              What was it?
            </label>
            <input
              id="meal-name"
              className="field"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Chicken rice bowl"
              required
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["kcal", "kcal"],
                ["proteinG", "Protein"],
                ["carbsG", "Carbs"],
                ["fatG", "Fat"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="label" htmlFor={`meal-${key}`}>
                  {label}
                </label>
                <input
                  id={`meal-${key}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className="field"
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </div>
            ))}
          </div>

          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Saving…" : "Log meal"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="px-4 pt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {meals.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          Nothing logged yet today.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {meals.map((meal) => (
            <li key={meal.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{meal.name}</p>
                <p className="mt-0.5 text-xs text-faint">
                  {MEAL_TYPE_LABELS[meal.meal_type]} · {meal.protein_g}p{" "}
                  {meal.carbs_g}c {meal.fat_g}f
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {meal.kcal}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(meal.id)}
                disabled={pending}
                aria-label={`Delete ${meal.name}`}
                className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
