import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 72.5 -> "72.5 kg", null -> "—" */
export function formatWeight(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "—";
  return `${Number(kg).toFixed(1).replace(/\.0$/, "")} kg`;
}

/** 3725 -> "1:02:05", 125 -> "2:05" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
