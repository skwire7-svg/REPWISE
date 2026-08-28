"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Light/dark switch for the header.
 *
 * The resolved theme is only known on the client, so the icon is withheld until
 * after mount — rendering a guessed icon server-side would flip visibly on
 * hydration. The button keeps its size throughout so nothing around it shifts.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={
        mounted
          ? `Switch to ${isDark ? "light" : "dark"} theme`
          : "Switch theme"
      }
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : undefined}
      className={cn(
        "group relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full",
        "border border-line bg-surface/70 text-content backdrop-blur",
        "transition-colors hover:border-accent/50 hover:bg-surface-2",
        className,
      )}
    >
      {/* Accent bloom that fills in from the centre on hover. */}
      <span
        aria-hidden
        className="absolute inset-0 scale-0 rounded-full bg-accent/15 transition-transform duration-300 group-hover:scale-100"
      />

      <AnimatePresence initial={false} mode="wait">
        {mounted && (
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={reduce ? false : { rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative"
          >
            {isDark ? (
              <Moon className="h-[18px] w-[18px]" />
            ) : (
              <Sun className="h-[18px] w-[18px] text-accent" />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
