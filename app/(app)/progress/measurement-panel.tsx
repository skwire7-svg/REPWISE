"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  MEASUREMENT_SITES,
  type BodyMeasurement,
  type MeasurementSiteKey,
} from "@/lib/types/database";
import { logMeasurementAction } from "./actions";

type FormState = Record<MeasurementSiteKey | "body_fat_pct", string>;

const EMPTY_FORM: FormState = {
  body_fat_pct: "",
  neck_cm: "",
  chest_cm: "",
  waist_cm: "",
  hips_cm: "",
  left_arm_cm: "",
  right_arm_cm: "",
  left_thigh_cm: "",
  right_thigh_cm: "",
};

export function MeasurementPanel({
  measurements,
  today,
}: {
  measurements: BodyMeasurement[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await logMeasurementAction({ loggedOn: date, ...form });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setForm(EMPTY_FORM);
      setOpen(false);
      router.refresh();
    });
  }

  const latest = measurements[0];

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Measurements</h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="btn-ghost shrink-0 text-xs"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {open ? "Cancel" : "Add"}
          </span>
        </button>
      </header>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-3 border-b border-line p-4">
          <p className="text-xs text-muted">
            Fill in whichever sites you measured — blanks are left untouched.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="m-date">
                Date
              </label>
              <input
                id="m-date"
                type="date"
                max={today}
                className="field"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="m-bodyfat">
                Body fat %
              </label>
              <input
                id="m-bodyfat"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="70"
                className="field"
                value={form.body_fat_pct}
                onChange={(event) =>
                  setForm({ ...form, body_fat_pct: event.target.value })
                }
              />
            </div>

            {MEASUREMENT_SITES.map((site) => (
              <div key={site.key}>
                <label className="label" htmlFor={`m-${site.key}`}>
                  {site.label} (cm)
                </label>
                <input
                  id={`m-${site.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="1"
                  max="300"
                  className="field"
                  value={form[site.key]}
                  onChange={(event) =>
                    setForm({ ...form, [site.key]: event.target.value })
                  }
                />
              </div>
            ))}
          </div>

          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Saving…" : "Save measurements"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="px-4 pt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!latest ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          Nothing measured yet. Waist and arms are the two most people track.
        </p>
      ) : (
        <div className="px-4 py-3">
          <p className="text-xs text-faint">Latest · {latest.logged_on}</p>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            {latest.body_fat_pct !== null && (
              <div>
                <dt className="text-xs text-muted">Body fat</dt>
                <dd className="font-mono text-sm tabular-nums">
                  {latest.body_fat_pct}%
                </dd>
              </div>
            )}
            {MEASUREMENT_SITES.filter((site) => latest[site.key] !== null).map(
              (site) => (
                <div key={site.key}>
                  <dt className="text-xs text-muted">{site.label}</dt>
                  <dd className="font-mono text-sm tabular-nums">
                    {String(latest[site.key])} cm
                  </dd>
                </div>
              ),
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
