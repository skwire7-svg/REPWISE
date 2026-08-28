"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";

export interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
}

/**
 * Counts from zero to `value` the first time the number scrolls into view.
 *
 * The digits are rendered into state rather than straight to the DOM so the
 * server-rendered markup already contains the final number — a crawler, or a
 * reduced-motion visitor, sees the real figure and never a zero.
 */
function Counter({ value, prefix = "", suffix = "" }: Omit<Stat, "label">) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView || reduce) return;
    setDisplay(0);
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display.toLocaleString("en-GB")}
      {suffix}
    </span>
  );
}

export function StatsBand({ stats }: { stats: Stat[] }) {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-y border-line bg-surface/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-10 px-5 py-14 sm:px-8 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            data-motion-reveal
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className="border-line px-2 text-center lg:border-l lg:first:border-l-0"
          >
            <p className="text-4xl font-bold tracking-tight text-content sm:text-5xl">
              <Counter
                value={stat.value}
                prefix={stat.prefix}
                suffix={stat.suffix}
              />
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-faint">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
