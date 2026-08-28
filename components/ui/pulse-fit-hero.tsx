"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, ChevronDown, Dumbbell, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavigationItem {
  label: string;
  href?: string;
  hasDropdown?: boolean;
  onClick?: () => void;
}

export interface ProgramCard {
  image: string;
  category: string;
  title: string;
  meta?: string;
  onClick?: () => void;
}

export interface HeroStat {
  value: string;
  label: string;
}

export interface PulseFitHeroProps {
  logo?: React.ReactNode;
  navigation?: NavigationItem[];
  ctaButton?: { label: string; onClick: () => void };
  /** Rendered in the header next to the CTA — the theme toggle lives here. */
  headerExtra?: React.ReactNode;
  /** Small pill above the headline. */
  eyebrow?: string;
  title: string;
  /** Substring of `title` painted in the accent colour. */
  highlight?: string;
  subtitle: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  disclaimer?: string;
  socialProof?: { avatars: string[]; text: string };
  /** Athlete photo composited into the background behind the copy. */
  athlete?: { src: string; alt: string };
  /** Floating chips pinned over the athlete on large screens. */
  stats?: HeroStat[];
  programs?: ProgramCard[];
  className?: string;
  children?: React.ReactNode;
}

/** Pixels per second for the program marquee. */
const MARQUEE_SPEED = 44;

/**
 * Splits the headline into lines of words so each word can be revealed on its
 * own, marking the words inside `highlight` for the accent colour.
 *
 * A "\n" in `title` forces a line break, which is how the headline keeps its
 * intended shape instead of breaking wherever the container happens to run out.
 */
function splitHeadline(title: string, highlight?: string) {
  const toWords = (text: string, accent: boolean) =>
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({ word, accent }));

  const at = highlight
    ? title.toLowerCase().indexOf(highlight.toLowerCase())
    : -1;

  return title.split("\n").map((line) => {
    if (at === -1 || !highlight) return toWords(line, false);

    // Locate the highlight within this line rather than the whole title, so a
    // highlight that sits on the second line still resolves.
    const lineAt = line.toLowerCase().indexOf(highlight.toLowerCase());
    if (lineAt === -1) return toWords(line, false);

    return [
      ...toWords(line.slice(0, lineAt), false),
      ...toWords(line.slice(lineAt, lineAt + highlight.length), true),
      ...toWords(line.slice(lineAt + highlight.length), false),
    ];
  });
}

/**
 * Marketing hero: animated background wash, a staggered headline, an athlete
 * photo composited behind the copy, and an auto-scrolling programme rail.
 *
 * Colours come from the Repwise tokens rather than literal hex values, so the
 * whole section follows the light/dark class on <html>. Every ambient animation
 * is gated on `useReducedMotion`, which leaves a fully static — still complete —
 * hero for anyone who asks the OS for less movement.
 */
export function PulseFitHero({
  logo = "Repwise",
  navigation = [],
  ctaButton,
  headerExtra,
  eyebrow,
  title,
  highlight,
  subtitle,
  primaryAction,
  secondaryAction,
  disclaimer,
  socialProof,
  athlete,
  stats = [],
  programs = [],
  className,
  children,
}: PulseFitHeroProps) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const [menuOpen, setMenuOpen] = useState(false);

  // Parallax: the athlete drifts slower than the copy as the page scrolls,
  // which gives the section depth without moving anything the user reads.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const athleteY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 120]), {
    stiffness: 90,
    damping: 20,
    mass: 0.4,
  });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  const lines = splitHeadline(title, highlight);
  let wordIndex = 0; // runs across lines so the stagger never restarts

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className={cn(
        "relative isolate flex w-full flex-col overflow-hidden bg-ink",
        className,
      )}
    >
      {/* ---------- Background layers ---------- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Base wash */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,var(--hero-wash-1),transparent_60%),radial-gradient(90%_70%_at_85%_20%,var(--hero-wash-2),transparent_65%)]" />

        {/* Drifting glow blobs */}
        <div className="absolute -left-32 top-10 h-[34rem] w-[34rem] animate-glow rounded-full bg-accent/20 blur-[120px]" />
        <div
          className="absolute -right-20 top-1/3 h-[28rem] w-[28rem] animate-glow rounded-full bg-accent-soft/15 blur-[110px]"
          style={{ animationDelay: "-3s" }}
        />

        {/* Panning grid, faded out towards the edges */}
        <div
          className="absolute inset-0 animate-grid-pan"
          style={{
            backgroundImage:
              "linear-gradient(var(--hero-grid) 1px, transparent 1px), linear-gradient(90deg, var(--hero-grid) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)",
          }}
        />

        {/* Athlete */}
        {athlete && (
          <motion.div
            style={{ y: reduce ? 0 : athleteY }}
            data-motion-reveal
            initial={reduce ? false : { opacity: 0, scale: 1.12, x: 60 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 w-full lg:w-[58%]"
          >
            <img
              src={athlete.src}
              alt={athlete.alt}
              className="h-full w-full object-cover object-[62%_22%] saturate-[0.85] contrast-[1.05]"
              style={{
                opacity: "var(--hero-photo-opacity)",
                mixBlendMode:
                  "var(--hero-photo-blend)" as React.CSSProperties["mixBlendMode"],
                maskImage:
                  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 28%, black 62%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 28%, black 62%)",
              }}
            />
            {/* Accent duotone pass + scrims that keep the copy readable */}
            <div className="absolute inset-0 bg-gradient-to-t from-accent/25 via-transparent to-transparent mix-blend-soft-light" />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-ink),transparent_45%)]" />
            <div className="absolute inset-y-0 left-0 w-2/3 bg-[linear-gradient(to_right,var(--color-ink),transparent)] lg:w-1/2" />
            {/* Below lg the photo sits directly behind the copy instead of
                beside it, so it needs a flat knock-back to stay readable. */}
            <div className="absolute inset-0 bg-ink/55 lg:hidden" />
          </motion.div>
        )}

        {/* Bottom fade into the page */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_top,var(--color-ink),transparent)]" />
      </div>

      {/* ---------- Header ---------- */}
      <motion.header
        data-motion-reveal
        initial={reduce ? false : { opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8"
      >
        <div className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-accent text-[#0b0b0c]">
            <Dumbbell className="h-5 w-5" strokeWidth={2.5} />
            <span
              aria-hidden
              className="absolute inset-0 animate-ping-ring rounded-xl border border-accent"
            />
          </span>
          {typeof logo === "string" ? <span>{logo}</span> : logo}
        </div>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {navigation.map((item) => (
            <a
              key={item.label}
              href={item.href ?? "#"}
              onClick={(event) => {
                if (item.onClick) {
                  event.preventDefault();
                  item.onClick();
                }
              }}
              className="group relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-content"
            >
              <span className="absolute inset-0 scale-90 rounded-full bg-surface-2/0 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:bg-surface-2 group-hover:opacity-100" />
              <span className="relative">{item.label}</span>
              {item.hasDropdown && (
                <ChevronDown
                  className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5"
                  aria-hidden
                />
              )}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {headerExtra}
          {ctaButton && (
            <motion.button
              type="button"
              onClick={ctaButton.onClick}
              whileHover={reduce ? undefined : { scale: 1.04 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="relative hidden overflow-hidden rounded-full border border-line bg-surface/80 px-5 py-2.5 text-sm font-semibold text-content backdrop-blur transition-colors hover:border-accent/60 sm:block"
            >
              <span className="relative z-10">{ctaButton.label}</span>
              <span
                aria-hidden
                className="absolute inset-y-0 -left-full w-1/2 animate-sheen bg-gradient-to-r from-transparent via-accent/25 to-transparent"
              />
            </motion.button>
          )}
          {navigation.length > 0 && (
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface/70 text-content backdrop-blur lg:hidden"
            >
              {menuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            aria-label="Mobile navigation"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-20 overflow-hidden border-y border-line bg-surface/90 backdrop-blur lg:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col px-5 py-2 sm:px-8">
              {navigation.map((item, index) => (
                <motion.a
                  key={item.label}
                  href={item.href ?? "#"}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * index }}
                  onClick={(event) => {
                    if (item.onClick) {
                      event.preventDefault();
                      item.onClick();
                    }
                    setMenuOpen(false);
                  }}
                  className="border-b border-line/60 py-3.5 text-sm font-medium text-muted last:border-0 hover:text-content"
                >
                  {item.label}
                </motion.a>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* ---------- Main copy ---------- */}
      {children ? (
        <div className="relative z-10 flex w-full flex-1 items-center justify-center">
          {children}
        </div>
      ) : (
        <motion.div
          style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}
          className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-10 pt-8 sm:px-8 sm:pt-14 lg:pb-20 lg:pt-20"
        >
          <div className="max-w-2xl">
            {eyebrow && (
              <motion.div
                data-motion-reveal
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-xs font-medium text-muted backdrop-blur"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping-ring rounded-full bg-accent" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                {eyebrow}
              </motion.div>
            )}

            <h1
              id={headingId}
              className="text-[clamp(2.5rem,7vw,4.75rem)] font-bold leading-[1.03] tracking-[-0.03em] text-content"
            >
              {/* Each word animates on its own, but the spaces stay as real
                  text nodes between the spans — a margin would look identical
                  and leave the h1's textContent reading "Trainsmarter." for
                  screen readers, crawlers and anyone copying the line. */}
              {lines.map((line, lineNumber) => (
                <span key={lineNumber} className="block">
                  {line.map(({ word, accent }) => {
                    const index = wordIndex++;
                    return (
                      <React.Fragment key={`${word}-${index}`}>
                        <motion.span
                          data-motion-reveal
                          initial={
                            reduce
                              ? false
                              : { opacity: 0, y: "0.5em", filter: "blur(8px)" }
                          }
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          transition={{
                            duration: 0.7,
                            delay: 0.15 + index * 0.07,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className={cn(
                            "inline-block",
                            accent && "text-accent",
                          )}
                        >
                          {word}
                        </motion.span>{" "}
                      </React.Fragment>
                    );
                  })}
                </span>
              ))}
            </h1>

            <motion.p
              data-motion-reveal
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            >
              {subtitle}
            </motion.p>

            {(primaryAction || secondaryAction) && (
              <motion.div
                data-motion-reveal
                initial={reduce ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                {primaryAction && (
                  <motion.button
                    type="button"
                    onClick={primaryAction.onClick}
                    whileHover={reduce ? undefined : { scale: 1.03 }}
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-accent px-7 py-4 text-base font-semibold text-[#0b0b0c] shadow-[0_8px_30px_-8px_var(--color-accent)]"
                  >
                    <span className="relative z-10">{primaryAction.label}</span>
                    <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                    <span
                      aria-hidden
                      className="absolute inset-y-0 -left-full w-1/2 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    />
                  </motion.button>
                )}

                {secondaryAction && (
                  <motion.button
                    type="button"
                    onClick={secondaryAction.onClick}
                    whileHover={reduce ? undefined : { scale: 1.03 }}
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    className="inline-flex items-center justify-center rounded-full border border-line bg-surface/60 px-7 py-4 text-base font-semibold text-content backdrop-blur transition-colors hover:border-accent/60 hover:bg-surface-2"
                  >
                    {secondaryAction.label}
                  </motion.button>
                )}
              </motion.div>
            )}

            {disclaimer && (
              <motion.p
                data-motion-reveal
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.75 }}
                className="mt-4 text-xs italic text-faint"
              >
                {disclaimer}
              </motion.p>
            )}

            {socialProof && (
              <motion.div
                data-motion-reveal
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.85 }}
                className="mt-10 flex items-center gap-3"
              >
                <div className="flex -space-x-2.5">
                  {socialProof.avatars.map((avatar, index) => (
                    <motion.img
                      key={avatar}
                      src={avatar}
                      alt=""
                      aria-hidden
                      data-motion-reveal
                      initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: 0.9 + index * 0.08,
                        type: "spring",
                        stiffness: 320,
                        damping: 18,
                      }}
                      whileHover={reduce ? undefined : { y: -4, scale: 1.1 }}
                      className="h-10 w-10 rounded-full border-2 border-ink object-cover"
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-muted">
                  {socialProof.text}
                </span>
              </motion.div>
            )}
          </div>

          {/* Floating stat chips over the athlete — desktop only, since on
              narrow screens they would land on top of the headline. */}
          {stats.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-8 hidden w-[38%] lg:block"
            >
              {stats.slice(0, 3).map((stat, index) => (
                <motion.div
                  key={stat.label}
                  data-motion-reveal
                  initial={reduce ? false : { opacity: 0, x: 40, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{
                    delay: 1 + index * 0.15,
                    type: "spring",
                    stiffness: 140,
                    damping: 16,
                  }}
                  className={cn(
                    "absolute rounded-2xl border border-line bg-surface/70 px-5 py-3.5 backdrop-blur-md",
                    "shadow-[0_18px_50px_-24px_rgba(0,0,0,0.65)]",
                    index === 0 && "left-0 top-[14%] animate-float",
                    index === 1 && "right-2 top-[44%] animate-float-slow",
                    // Kept high and left so it lands on gym background rather
                    // than across the athlete's shoulder.
                    index === 2 && "bottom-[30%] left-0 animate-float",
                  )}
                  style={{ animationDelay: `${index * -2.5}s` }}
                >
                  <p className="text-2xl font-bold tracking-tight text-content">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-faint">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ---------- Programme rail ---------- */}
      {programs.length > 0 && <ProgramMarquee programs={programs} />}
    </section>
  );
}

/**
 * Infinite programme rail.
 *
 * Two identical card sets sit side by side and the track is translated by the
 * measured width of one set, then wrapped — so the seam never lands mid-card at
 * any breakpoint. Driving it from an animation frame rather than a keyframe
 * loop is what lets hover pause it without the position snapping.
 */
function ProgramMarquee({ programs }: { programs: ProgramCard[] }) {
  const reduce = useReducedMotion();
  const setRef = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(0);
  const [paused, setPaused] = useState(false);
  const x = useMotionValue(0);

  useEffect(() => {
    const el = setRef.current;
    if (!el) return;
    const measure = () => setSpan(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [programs.length]);

  useAnimationFrame((_, delta) => {
    if (reduce || paused || span === 0) return;
    // A backgrounded tab hands back a huge delta on return; clamp it so the
    // rail resumes instead of teleporting.
    const step = (Math.min(delta, 50) / 1000) * MARQUEE_SPEED;
    const next = x.get() - step;
    x.set(next <= -span ? next + span : next);
  });

  const cards = (setKey: string, ref?: React.Ref<HTMLDivElement>) => (
    <div ref={ref} className="flex shrink-0 gap-5 pr-5">
      {programs.map((program, index) => (
        <ProgramTile
          key={`${setKey}-${program.title}-${index}`}
          program={program}
          reduce={Boolean(reduce)}
        />
      ))}
    </div>
  );

  return (
    // Animated on mount rather than whileInView: the rail sits inside the hero,
    // and on a laptop-height viewport only its top edge is on screen — not
    // enough to trip a scroll threshold, which left it invisible at rest.
    <motion.div
      data-motion-reveal
      initial={reduce ? false : { opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-10 w-full overflow-hidden pb-16 pt-4 lg:pb-24"
    >
      {/* Edge fades, tied to the page colour so they work in both themes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-[linear-gradient(to_right,var(--color-ink),transparent)] sm:w-32"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-[linear-gradient(to_left,var(--color-ink),transparent)] sm:w-32"
      />

      <motion.div
        style={{ x }}
        className="flex w-max pl-5"
        onHoverStart={() => setPaused(true)}
        onHoverEnd={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {cards("a", setRef)}
        {/* Duplicate set, hidden from assistive tech so cards aren't announced
            twice. */}
        <div aria-hidden>{cards("b")}</div>
      </motion.div>
    </motion.div>
  );
}

function ProgramTile({
  program,
  reduce,
}: {
  program: ProgramCard;
  reduce: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={program.onClick}
      whileHover={reduce ? undefined : { y: -12, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="group relative h-[360px] w-[260px] shrink-0 overflow-hidden rounded-3xl border border-line text-left shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] sm:h-[420px] sm:w-[300px] lg:h-[460px] lg:w-[340px]"
    >
      <img
        src={program.image}
        alt=""
        aria-hidden
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.85),rgba(0,0,0,0.15)_55%,transparent)]" />
      {/* Accent edge that lights up on hover */}
      <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-accent/0 transition-all duration-300 group-hover:ring-2 group-hover:ring-accent/70" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6">
        <span className="w-fit rounded-full bg-accent/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0b0b0c]">
          {program.category}
        </span>
        <h3 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
          {program.title}
        </h3>
        {program.meta && (
          <p className="text-sm text-white/70">{program.meta}</p>
        )}
        <span className="mt-1 flex translate-y-2 items-center gap-1.5 text-sm font-medium text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          View programme
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </motion.button>
  );
}
