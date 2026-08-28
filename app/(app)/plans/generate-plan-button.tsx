"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { generatePlanAction } from "./actions";

/**
 * Generation takes a while — the model is reasoning over the whole exercise
 * library — so the button reports what it's doing rather than just spinning.
 */
export function GeneratePlanButton({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generatePlanAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={variant === "primary" ? "btn-primary" : "btn-ghost"}
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden />
          {pending ? "Building your plan…" : label}
        </span>
      </button>

      {pending && (
        <p className="mt-2 text-xs text-faint">
          This takes up to a minute. Don&apos;t close the tab.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
