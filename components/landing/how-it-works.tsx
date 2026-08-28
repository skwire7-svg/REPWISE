"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

export interface Step {
  title: string;
  body: string;
}

/**
 * Vertical timeline whose accent rail fills as the section scrolls past.
 *
 * scaleY is driven straight off the scroll progress motion value, so the rail
 * tracks the scrollbar exactly — including when the user drags it backwards —
 * rather than replaying a fixed-length animation.
 */
export function HowItWorks({
  eyebrow,
  title,
  steps,
}: {
  eyebrow: string;
  title: string;
  steps: Step[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 60%"],
  });
  const railScale = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    // overflow-x-clip, not hidden: the steps slide in from x:24 and sit at that
    // offset until scrolled into view, which would otherwise widen the document
    // and put a horizontal scrollbar on phones. `clip` contains that without
    // creating a scroll container.
    <section
      id="how-it-works"
      className="relative overflow-x-clip border-y border-line bg-surface/30"
    >
      <div className="mx-auto max-w-4xl px-5 py-24 sm:px-8">
        <motion.div
          data-motion-reveal
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-bold leading-tight tracking-[-0.02em] text-content">
            {title}
          </h2>
        </motion.div>

        <div ref={ref} className="relative mt-14 pl-12">
          {/* Track + fill */}
          <div
            aria-hidden
            className="absolute bottom-2 left-[15px] top-2 w-px bg-line"
          />
          <motion.div
            aria-hidden
            style={{ scaleY: reduce ? 1 : railScale }}
            className="absolute bottom-2 left-[15px] top-2 w-px origin-top bg-gradient-to-b from-accent to-accent-soft"
          />

          {/* pl-0 matters: the browser's default list indent would push the
              items past the viewport on narrow screens and knock the numbered
              markers out of line with the rail. */}
          <ol className="list-none space-y-12 pl-0">
            {steps.map((step, index) => (
              <motion.li
                key={step.title}
                data-motion-reveal
                initial={reduce ? false : { opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <span className="absolute -left-12 grid h-8 w-8 place-items-center rounded-full border border-accent/50 bg-ink text-xs font-bold text-accent">
                  {index + 1}
                </span>
                <h3 className="text-lg font-semibold tracking-tight text-content">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
