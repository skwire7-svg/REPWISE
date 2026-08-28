"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * Closing call to action.
 *
 * These are real navigations, so they are <Link>s rather than the hero's
 * onClick buttons — the landing page should still work with JS disabled and
 * the routes should be prefetchable.
 */
export function CtaBand({
  title,
  subtitle,
  primary,
  secondary,
  footnote,
}: {
  title: string;
  subtitle: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  footnote?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 animate-glow rounded-full bg-accent/20 blur-[130px]"
      />

      <motion.div
        data-motion-reveal
        initial={reduce ? false : { opacity: 0, y: 32, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-3xl rounded-[2rem] border border-line bg-surface/70 px-8 py-14 text-center backdrop-blur-xl sm:px-14"
      >
        <h2 className="text-[clamp(1.9rem,4.5vw,3rem)] font-bold leading-tight tracking-[-0.02em] text-content">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
          {subtitle}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={primary.href}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-accent px-7 py-4 text-base font-semibold text-[#0b0b0c] shadow-[0_8px_30px_-8px_var(--color-accent)] transition-transform hover:scale-[1.03]"
          >
            <span className="relative z-10">{primary.label}</span>
            <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            <span
              aria-hidden
              className="absolute inset-y-0 -left-full w-1/2 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
          </Link>

          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex items-center rounded-full border border-line bg-surface px-7 py-4 text-base font-semibold text-content transition-colors hover:border-accent/60 hover:bg-surface-2"
            >
              {secondary.label}
            </Link>
          )}
        </div>

        {footnote && <p className="mt-5 text-xs text-faint">{footnote}</p>}
      </motion.div>
    </section>
  );
}
