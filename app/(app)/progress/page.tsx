import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/profile";
import {
  getMeasurements,
  getPersonalRecords,
  getWeeklyVolume,
  getWeightLogs,
} from "@/lib/db/progress";
import { isCompleteProfile } from "@/lib/types/database";
import { MeasurementPanel } from "./measurement-panel";
import { ProgressCharts } from "./progress-charts";
import { WeightPanel } from "./weight-panel";

export default async function ProgressPage() {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) redirect("/onboarding");

  const today = new Date().toISOString().slice(0, 10);

  const [weights, volume, records, measurements] = await Promise.all([
    getWeightLogs(user.id),
    getWeeklyVolume(user.id),
    getPersonalRecords(user.id),
    getMeasurements(user.id),
  ]);

  const first = weights[0];
  const latest = weights[weights.length - 1];
  const change =
    first && latest && weights.length > 1 ? latest.weight_kg - first.weight_kg : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted">
          Bodyweight, training volume and personal bests over time.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-muted">Current weight</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {latest ? `${latest.weight_kg}` : "—"}
            <span className="text-sm font-medium text-muted"> kg</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Change so far</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              change === null ? "" : change < 0 ? "text-success" : "text-content"
            }`}
          >
            {change === null
              ? "—"
              : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}
            {change !== null && (
              <span className="text-sm font-medium text-muted"> kg</span>
            )}
          </p>
        </div>
      </div>

      <ProgressCharts
        weights={weights.map((w) => ({
          date: w.logged_on,
          weightKg: Number(w.weight_kg),
        }))}
        volume={volume}
      />

      <WeightPanel today={today} current={latest?.weight_kg ?? profile.weight_kg} />

      <section className="card overflow-hidden">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Personal bests</h2>
        </header>
        {records.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Log a few sets and your best lifts will appear here automatically.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {records.map((record) => (
              <li
                key={record.id}
                className="flex items-baseline justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {record.exercise?.name ?? "Exercise"}
                  </p>
                  <p className="text-xs text-faint">{record.achieved_on}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm tabular-nums">
                    {record.weight_kg} kg × {record.reps}
                  </p>
                  <p className="font-mono text-xs text-faint">
                    e1RM {record.est_one_rep_max}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MeasurementPanel measurements={measurements} today={today} />
    </div>
  );
}
