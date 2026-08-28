"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import type { SessionWithSets } from "@/lib/db/workouts";
import { deleteSetAction, endSessionAction, logSetAction } from "./actions";

interface PlannedExercise {
  id: string;
  name: string;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  notes: string | null;
}

/**
 * Set-by-set logging for a session in progress.
 *
 * Every set is written to Supabase the moment it's entered rather than batched
 * into a save at the end — phones lose signal in basements and gyms, and losing
 * an hour of logged work to a dropped connection is unforgivable.
 */
export function SessionLogger({
  session,
  exercises,
}: {
  session: SessionWithSets;
  exercises: PlannedExercise[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(session.notes ?? "");

  const setsByExercise = useMemo(() => {
    const map = new Map<string, SessionWithSets["set_logs"]>();
    for (const set of session.set_logs) {
      const existing = map.get(set.exercise_id) ?? [];
      existing.push(set);
      map.set(set.exercise_id, existing);
    }
    return map;
  }, [session.set_logs]);

  const totalSets = session.set_logs.length;

  function handleFinish() {
    setError(null);
    startTransition(async () => {
      const result = await endSessionAction(session.id, notes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Session in progress
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{session.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {totalSets} {totalSets === 1 ? "set" : "sets"} logged
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {exercises.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          This session isn&apos;t linked to a plan day, so there&apos;s nothing
          prescribed to log against. Finish it and start one from a plan day
          instead.
        </p>
      ) : (
        exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            sessionId={session.id}
            exercise={exercise}
            logged={setsByExercise.get(exercise.id) ?? []}
          />
        ))
      )}

      <div className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="session-notes">
            Session notes
          </label>
          <textarea
            id="session-notes"
            className="field min-h-20"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="How did it feel? Anything to change next time?"
          />
        </div>
        <button
          type="button"
          onClick={handleFinish}
          disabled={pending}
          className="btn-primary w-full"
        >
          {pending ? "Finishing…" : "Finish workout"}
        </button>
      </div>
    </div>
  );
}

function ExerciseCard({
  sessionId,
  exercise,
  logged,
}: {
  sessionId: string;
  exercise: PlannedExercise;
  logged: SessionWithSets["set_logs"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Prefill from the last set of this exercise: weight rarely changes set to
  // set, and retyping it every time is the fastest way to make people stop
  // logging.
  const last = logged[logged.length - 1];
  const [weight, setWeight] = useState(last?.weight_kg?.toString() ?? "");
  const [reps, setReps] = useState(last?.reps?.toString() ?? "");

  const nextSetNumber = logged.length + 1;
  const done = logged.length >= exercise.targetSets;

  function handleLog() {
    setError(null);
    startTransition(async () => {
      const result = await logSetAction({
        sessionId,
        exerciseId: exercise.id,
        setNumber: nextSetNumber,
        weightKg: weight === "" ? null : weight,
        reps: reps === "" ? null : reps,
        rpe: null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(setId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteSetAction(setId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="truncate text-sm font-semibold">{exercise.name}</h2>
        <span
          className={`shrink-0 font-mono text-xs ${done ? "text-success" : "text-muted"}`}
        >
          {logged.length}/{exercise.targetSets} × {exercise.targetReps}
        </span>
      </header>

      {logged.length > 0 && (
        <ul className="divide-y divide-line">
          {logged.map((set) => (
            <li
              key={set.id}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <span className="font-mono text-xs text-muted">
                Set {set.set_number}
              </span>
              <span className="flex-1 text-right font-mono text-sm">
                {set.weight_kg ?? "—"} kg × {set.reps ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(set.id)}
                disabled={pending}
                aria-label={`Delete set ${set.set_number}`}
                className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 border-t border-line px-4 py-3">
        <div className="flex-1">
          <label className="label" htmlFor={`weight-${exercise.id}`}>
            kg
          </label>
          <input
            id={`weight-${exercise.id}`}
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            className="field"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor={`reps-${exercise.id}`}>
            reps
          </label>
          <input
            id={`reps-${exercise.id}`}
            type="number"
            inputMode="numeric"
            min="0"
            className="field"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={handleLog}
          disabled={pending}
          className="btn-primary mb-px shrink-0"
          aria-label={`Log set ${nextSetNumber}`}
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
