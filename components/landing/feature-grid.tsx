"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Spans two columns on desktop — use for the one headline feature. */
  wide?: boolean;
}

/**
 * Card with a spotlight that tracks the pointer.
 *
 * The position is written to motion values instead of React state so the
 * gradient updates on the compositor and a mouse sweep across the grid doesn't
 * re-render every sibling card.
 */
function FeatureCard({
  feature,
  index,
}: {
  feature: Feature;
  index: number;
}) {
  const { icon: Icon, title, body, wide } = feature;
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const spotlight = useMotionTemplate`radial-gradient(280px circle at ${mouseX}px ${mouseY}px, var(--color-accent), transparent 80%)`;

  return (
    <motion.div
      ref={ref}
      onMouseMove={(event) => {
        const bounds = ref.current?.getBoundingClientRect();
        if (!bounds) return;
        mouseX.set(event.clientX - bounds.left);
        mouseY.set(event.clientY - bounds.top);
      }}
      data-motion-reveal
      initial={reduce ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{
        duration: 0.65,
        delay: (index % 3) * 0.1,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-line bg-surface p-7 transition-colors duration-300 hover:border-accent/40",
        wide && "sm:col-span-2",
      )}
    >
      <motion.div
        aria-hidden
        style={{ background: spotlight }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-[0.07]"
      />

      <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-accent-dim/50 text-accent transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-6">
        <Icon className="h-6 w-6" aria-hidden />
      </span>

      <h3 className="relative mt-5 text-lg font-semibold tracking-tight text-content">
        {title}
      </h3>
      <p className="relative mt-2 text-sm leading-relaxed text-muted">{body}</p>

      {/* Accent rule that draws itself in on hover */}
      <span
        aria-hidden
        className="absolute inset-x-7 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-accent to-transparent transition-transform duration-500 group-hover:scale-x-100"
      />
    </motion.div>
  );
}

export function FeatureGrid({
  eyebrow,
  title,
  subtitle,
  features,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  features: Feature[];
}) {
  const reduce = useReducedMotion();

  return (
    <section id="features" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div
        data-motion-reveal
        initial={reduce ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-bold leading-tight tracking-[-0.02em] text-content">
          {title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted">{subtitle}</p>
      </motion.div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <FeatureCard key={feature.title} feature={feature} index={index} />
        ))}
      </div>
    </section>
  );
}
