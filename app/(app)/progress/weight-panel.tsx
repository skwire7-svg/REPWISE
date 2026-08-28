"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logWeightAction } from "./actions";

export function WeightPanel({
  today,
  current,
}: {
  today: string;
  current: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [weight, setWeight] = useState(String(current));
  const [date, setDate] = useState(today);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await logWeightAction({ weightKg: weight, loggedOn: date });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Log your weight</h2>
      <p className="mt-1 text-xs text-muted">
        This also updates your calorie and macro targets.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <div className="w-24">
          <label className="label" htmlFor="weight-kg">
            kg
          </label>
          <input
            id="weight-kg"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="30"
            max="300"
            className="field"
            value={weight}
            onChange={(event) => {
              setWeight(event.target.value);
              setSaved(false);
            }}
            required
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="weight-date">
            Date
          </label>
          <input
            id="weight-date"
            type="date"
            max={today}
            className="field"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSaved(false);
            }}
            required
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary mb-px shrink-0">
          {pending ? "Saving…" : "Save"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-2 text-sm text-success">
          Saved.
        </p>
      )}
    </section>
  );
}
