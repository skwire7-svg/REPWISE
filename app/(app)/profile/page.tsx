import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/profile";
import { signOutAction } from "@/lib/auth/actions";
import { calculateAge, calculateBMI } from "@/lib/fitness/metrics";
import {
  ACTIVITY_LABELS,
  EQUIPMENT_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  isCompleteProfile,
} from "@/lib/types/database";
import { formatWeight } from "@/lib/utils";

export default async function ProfilePage() {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) redirect("/onboarding");

  const rows: Array<[string, string]> = [
    ["Name", profile.full_name ?? "—"],
    ["Email", user.email],
    ["Phone", profile.phone ?? "—"],
    ["Age", `${calculateAge(profile.date_of_birth)}`],
    ["Height", `${profile.height_cm} cm`],
    ["Weight", formatWeight(profile.weight_kg)],
    ["BMI", `${calculateBMI(profile.weight_kg, profile.height_cm)}`],
    ["Goal", GOAL_LABELS[profile.goal]],
    ["Experience", EXPERIENCE_LABELS[profile.experience_level]],
    ["Activity", ACTIVITY_LABELS[profile.activity_level]],
    ["Trains at", profile.training_location === "gym" ? "A gym" : "Home"],
    ["Days per week", `${profile.days_per_week}`],
    ["Diet", profile.dietary_preference || "No preference"],
    ["Allergies", profile.allergies.length ? profile.allergies.join(", ") : "None"],
    ["Injuries", profile.injuries || "None"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted">
            These details drive every plan the AI builds for you.
          </p>
        </div>
        {/* Re-runs the onboarding wizard, which updates the same profile row. */}
        <Link
          href="/onboarding"
          className="btn-ghost inline-flex shrink-0 items-center gap-1.5 !py-2 !px-3 text-sm"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Link>
      </div>

      <dl className="card divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <dt className="shrink-0 text-sm text-muted">{label}</dt>
            <dd className="text-right text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="card p-5">
        <p className="text-xs text-faint">Equipment available</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.available_equipment.length === 0 ? (
            <span className="text-sm text-muted">None selected</span>
          ) : (
            profile.available_equipment.map((e) => (
              <span
                key={e}
                className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs"
              >
                {EQUIPMENT_LABELS[e]}
              </span>
            ))
          )}
        </div>
      </div>

      <form action={signOutAction}>
        <button
          type="submit"
          className="btn-ghost inline-flex w-full items-center justify-center gap-2 text-danger"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}
