"use client";

import { useRouter } from "next/navigation";
import { MotionConfig } from "framer-motion";
import {
  Dumbbell,
  LineChart,
  MessageSquareText,
  Salad,
  Sparkles,
  Timer,
} from "lucide-react";
import { PulseFitHero } from "@/components/ui/pulse-fit-hero";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CtaBand } from "@/components/landing/cta-band";
import { FeatureGrid, type Feature } from "@/components/landing/feature-grid";
import { HowItWorks, type Step } from "@/components/landing/how-it-works";
import { StatsBand, type Stat } from "@/components/landing/stats-band";

/**
 * All landing copy and imagery lives here rather than in the page.
 *
 * The feature cards carry lucide component references and the hero takes
 * onClick handlers — neither survives the server/client boundary as a prop — so
 * the content sits inside this client module and app/page.tsx stays a server
 * component that can still export metadata.
 */

const HERO_ATHLETE = {
  src: "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=1400&q=80&auto=format&fit=crop",
  alt: "Athlete training with battle ropes in a gym",
};

const PROGRAMS = [
  {
    image:
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=700&h=940&fit=crop&q=75&auto=format",
    category: "Strength",
    title: "Upper-body power block",
    meta: "6 weeks · 4 days/wk",
  },
  {
    image:
      "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=700&h=940&fit=crop&q=75&auto=format",
    category: "Advanced",
    title: "Calisthenics pull mastery",
    meta: "8 weeks · bodyweight",
  },
  {
    image:
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=700&h=940&fit=crop&q=75&auto=format",
    category: "Hypertrophy",
    title: "Dumbbell density",
    meta: "5 weeks · home gym",
  },
  {
    image:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=700&h=940&fit=crop&q=75&auto=format",
    category: "All levels",
    title: "Full-body bootcamp",
    meta: "4 weeks · 3 days/wk",
  },
  {
    image:
      "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=700&h=940&fit=crop&q=75&auto=format",
    category: "Conditioning",
    title: "Trail sprint intervals",
    meta: "6 weeks · outdoor",
  },
  {
    image:
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=700&h=940&fit=crop&q=75&auto=format",
    category: "Beginner",
    title: "Core & mobility flow",
    meta: "3 weeks · 20 min",
  },
];

// Placeholder marketing figures — swap these for real numbers before launch.
const STATS: Stat[] = [
  { value: 12000, suffix: "+", label: "Sessions logged" },
  { value: 240, suffix: "+", label: "Exercises in the library" },
  { value: 18, prefix: "+", suffix: "%", label: "Avg. strength at 12 weeks" },
  { value: 60, suffix: "s", label: "To your first plan" },
];

const FEATURES: Feature[] = [
  {
    icon: Dumbbell,
    title: "Plans built around you",
    body: "Your height, weight, age, experience and goal drive the plan — not a template someone else was given.",
  },
  {
    icon: Salad,
    title: "Nutrition that adds up",
    body: "Calorie and macro targets calculated from your real numbers, then turned into meals you'd actually eat.",
  },
  {
    icon: MessageSquareText,
    title: "A coach that knows your log",
    body: "Ask anything. The AI can see what you lifted last session, so the answer is about you.",
  },
  {
    icon: LineChart,
    title: "Progress you can see",
    body: "Volume, bodyweight and strength curves over time, with personal bests called out automatically.",
  },
  {
    icon: Timer,
    title: "Built for the gym floor",
    body: "Logging a set is two taps, one-handed, with the rest timer running — no squinting between working sets.",
  },
  {
    icon: Sparkles,
    title: "Adapts as you go",
    body: "Stalled on a lift or missed a week? The next block is rewritten around what actually happened.",
  },
];

const STEPS: Step[] = [
  {
    title: "Tell us your numbers",
    body: "Height, weight, age, training history, equipment and the goal you're chasing. Two minutes, once.",
  },
  {
    title: "Get your plan and your plate",
    body: "A training block and a matching calorie and macro target land together, because one without the other stalls.",
  },
  {
    title: "Log every set as you lift",
    body: "Weight, reps, RPE. The log is the source of truth for everything the coach tells you next.",
  },
  {
    title: "Watch it adapt",
    body: "Progress, plateaus and missed sessions all feed the next block. The plan follows you, not the calendar.",
  },
];

export function RepwiseLanding() {
  const router = useRouter();

  const scrollTo = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    // reducedMotion="user" tells framer to drop transform animations when the
    // OS asks for reduced motion; the data-motion-reveal rule in globals.css
    // handles the entrance states, which framer commits before that preference
    // can be read on the first render.
    <MotionConfig reducedMotion="user">
      <PulseFitHero
        logo={
          <span>
            Rep<span className="text-accent">wise</span>
          </span>
        }
        navigation={[
          { label: "Features", href: "#features", onClick: scrollTo("features") },
          { label: "Programmes", href: "#programmes", hasDropdown: true, onClick: scrollTo("programmes") },
          { label: "How it works", href: "#how-it-works", onClick: scrollTo("how-it-works") },
          { label: "Log in", href: "/login" },
        ]}
        ctaButton={{
          label: "Get started",
          onClick: () => router.push("/signup"),
        }}
        headerExtra={<ThemeToggle />}
        // Copy split three ways so each line does one job: the eyebrow says
        // what this is, the headline says why it's different, the subtitle says
        // how. The headline leads on the adaptive loop rather than a "train
        // smarter" style slogan — it's the one claim a competitor can't copy,
        // and it's the thing the log/plan/coach features all pay off.
        eyebrow="Workout plans · Diet plans · AI coach"
        title={"Every rep you log\nrewrites the plan."}
        highlight="rewrites the plan."
        subtitle="Most apps hand you a programme and walk away. Repwise reads every set, then rebuilds your training and your meals around what actually happened."
        primaryAction={{
          label: "Build my first plan",
          onClick: () => router.push("/signup"),
        }}
        secondaryAction={{
          label: "I already have an account",
          onClick: () => router.push("/login"),
        }}
        disclaimer="*Free to start — no card, no commitment."
        socialProof={{
          avatars: [
            "https://i.pravatar.cc/150?img=12",
            "https://i.pravatar.cc/150?img=33",
            "https://i.pravatar.cc/150?img=52",
            "https://i.pravatar.cc/150?img=68",
          ],
          text: "Join lifters who stopped guessing",
        }}
        athlete={HERO_ATHLETE}
        // Deliberately different figures from the stats band further down the
        // page, so the two sections don't repeat each other.
        stats={[
          { value: "4 days", label: "Per week" },
          { value: "2 taps", label: "To log a set" },
          { value: "24/7", label: "Coach on call" },
        ]}
        programs={PROGRAMS.map((program) => ({
          ...program,
          onClick: () => router.push("/signup"),
        }))}
      />

      <div id="programmes" />

      <StatsBand stats={STATS} />

      <FeatureGrid
        eyebrow="Why Repwise"
        title="One profile. Every answer about your training."
        subtitle="Most apps hand you a plan and leave. Repwise keeps reading your log — so the plan, the plate and the coaching all stay pointed at the same goal."
        features={FEATURES}
      />

      <HowItWorks
        eyebrow="How it works"
        title="From your numbers to your next set."
        steps={STEPS}
      />

      <CtaBand
        title="Your next block is a profile away."
        subtitle="Answer a few questions and Repwise writes the training and the nutrition together — then keeps rewriting them as you log."
        primary={{ label: "Create your plan", href: "/signup" }}
        secondary={{ label: "Log in", href: "/login" }}
        footnote="Free to start · No credit card required"
      />
    </MotionConfig>
  );
}
