import Link from "next/link";
import { Dumbbell } from "lucide-react";

import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { FooterMedia, type FooterMediaItem } from "@/components/ui/footer-media";
import { cn } from "@/lib/utils";

/**
 * Site footer, closed out by an oversized wordmark with training shots
 * punching through it.
 *
 * Content arrives as props the way CtaBand and FeatureGrid take theirs, so the
 * copy stays with the page that renders it and this file stays presentational.
 * The defaults below describe Repwise, which is the only caller today.
 *
 * The footer itself is a server component — every child is a <Link>, an <img>
 * or static markup. Only the media strip is a client leaf, and only because
 * video needs a reduced-motion check that CSS cannot perform.
 *
 * Trade-off worth knowing: the landing page is statically prerendered, so the
 * copyright year from new Date() is fixed at *build* time and only refreshes on
 * redeploy. If that matters, pass the year in from a dynamic caller.
 *
 * The wordmark is decorative — it repeats the brand name already announced by
 * the logo link above it — so it is aria-hidden and unselectable rather than
 * read out a second time.
 */

export type FooterLink = {
  label: string;
  href: string;
};

export type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Programmes", href: "/#programmes" },
      { label: "How it works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Your training",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Plans", href: "/plans" },
      { label: "Diet", href: "/diet" },
      { label: "Progress", href: "/progress" },
      { label: "Coach", href: "/coach" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Create account", href: "/signup" },
      { label: "Profile", href: "/profile" },
    ],
  },
];

const DEFAULT_SOCIALS: FooterLink[] = [
  { label: "X", href: "https://x.com" },
  { label: "GitHub", href: "https://github.com" },
  { label: "Instagram", href: "https://instagram.com" },
];

/**
 * Unsplash shots of people actually training. These photo IDs are already used
 * by the programme rail in repwise-landing, so they are known good; the three
 * chosen here avoid repeating the hero athlete further up the page.
 *
 * To use footage instead, pass `media` with { type: "video", src, poster } —
 * an .mp4 in /public works, and the poster is what reduced-motion viewers get.
 */
const DEFAULT_MEDIA: FooterMediaItem[] = [
  {
    src: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=520&h=700&fit=crop&q=75&auto=format",
    alt: "Lifter pressing a barbell during an upper-body session",
  },
  {
    // The largest card, so it has to be a person mid-effort — the previous
    // pick here rendered as an empty dumbbell rack, which read as stock filler
    // next to two shots of people training.
    src: "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=640&h=860&fit=crop&q=75&auto=format",
    alt: "Athlete driving through a battle-rope set",
  },
  {
    src: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=520&h=700&fit=crop&q=75&auto=format",
    alt: "Athlete training pull-ups on a bar",
  },
];

const SOCIAL_ICONS: Record<
  string,
  (props: React.HTMLAttributes<SVGElement>) => React.ReactElement
> = {
  X: Icons.twitter,
  GitHub: Icons.gitHub,
  Instagram: Icons.instagram,
};

export function Footer({
  brand = "Repwise",
  wordmark = "Repwise",
  tagline = "AI training and nutrition that rewrite themselves as you log.",
  columns = DEFAULT_COLUMNS,
  socials = DEFAULT_SOCIALS,
  media = DEFAULT_MEDIA,
  cta = { label: "Create your plan", href: "/signup" },
  disclaimer,
  className,
}: {
  brand?: string;
  wordmark?: string;
  tagline?: string;
  columns?: FooterColumn[];
  socials?: FooterLink[];
  media?: FooterMediaItem[];
  cta?: FooterLink | null;
  disclaimer?: string;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        // The tight leading on the wordmark lets its descenders spill past the
        // text box, so the bottom padding has to clear them or overflow-hidden
        // shears the tail off the "p".
        "relative overflow-hidden border-t border-line bg-ink px-5 pt-16 pb-16 sm:px-8 sm:pb-24",
        className,
      )}
    >
      <div className="mx-auto max-w-7xl">
        {/*
          Two tracks, with the nav getting the wider one and splitting it into
          three equal columns of its own. Previously this was flex with
          justify-between, which pinned the brand to one edge and bunched three
          narrow columns against the other, leaving the middle of a wide desktop
          footer as dead space. Sizing the nav track and letting its columns
          spread inside fills that gap — and keeps <nav> a real element rather
          than display:contents, which drops the landmark from the a11y tree in
          some browsers.
        */}
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.6fr)_minmax(0,3fr)] md:gap-14">
          {/* Brand block */}
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-content"
            >
              <Dumbbell className="h-6 w-6 text-accent" aria-hidden />
              <span>{brand}</span>
            </Link>

            <p className="mt-4 text-sm leading-relaxed text-muted">{tagline}</p>

            {cta ? (
              <Button asChild className="mt-6">
                <Link href={cta.href}>{cta.label}</Link>
              </Button>
            ) : null}

            {socials.length > 0 ? (
              <ul className="mt-8 flex items-center gap-3">
                {socials.map((social) => {
                  const Icon = SOCIAL_ICONS[social.label];
                  return (
                    <li key={social.label}>
                      <Link
                        href={social.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`${brand} on ${social.label}`}
                        className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface/70 text-muted transition-colors hover:border-accent/50 hover:bg-surface-2 hover:text-content"
                      >
                        {Icon ? (
                          <Icon className="h-4 w-4" aria-hidden />
                        ) : (
                          <span className="text-xs font-semibold">
                            {social.label.charAt(0)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* Link columns */}
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-6"
          >
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold text-content">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted transition-colors hover:text-content"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Hairline rule separates the navigation from the fine print, so the
            legal block reads as a footnote rather than another column. */}
        <div className="mt-14 border-t border-line pt-8">
          {disclaimer ? (
            <p className="max-w-3xl text-xs leading-relaxed text-faint">
              {disclaimer}
            </p>
          ) : null}

          <p className={cn("text-xs text-faint", disclaimer && "mt-5")}>
            © {new Date().getFullYear()} {brand}. All rights reserved.
          </p>
        </div>
      </div>

      {/*
        The cards sit ABOVE the wordmark and the word is pulled back up behind
        them, so the two interlock instead of one burying the other: only the
        top slice of the letters passes under a card, and the gaps between cards
        leave whole letters exposed. Stacking them concentrically (the earlier
        version) put a solid block of photos across the middle of the name and
        made it unreadable.

        The word is allowed to run wider than the 7xl content column and bleed
        to the viewport edges, which is what makes it read as a graphic rather
        than a heading — the footer's overflow-hidden clips the ends.
      */}
      <div className="relative mt-16 flex w-full flex-col items-center">
        {/* Warm bloom behind the cards, so they sit in light rather than on a
            flat panel. Anchored to the top of the block, which is where the
            photos are — at the bottom it just muddied the wordmark. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 h-[20rem] w-full max-w-2xl rounded-full bg-accent/25 blur-[110px] sm:h-[26rem]"
        />

        <FooterMedia items={media} className="relative z-10" />

        <span
          aria-hidden
          className={cn(
            "relative z-0 select-none whitespace-nowrap text-center",
            // Negative margin is what tucks the letter-tops behind the cards.
            // It scales with the viewport so the overlap stays proportional
            // instead of swallowing the word on small screens. Roughly a third
            // of the cap height — enough that the cards visibly interlock with
            // the word rather than resting on it, while every letter is still
            // identifiable from the two-thirds left showing.
            "-mt-[clamp(1.25rem,2.5vw,3rem)]",
            "text-[clamp(4rem,20vw,18rem)] font-extrabold leading-[0.85] tracking-[-0.045em] text-accent",
          )}
        >
          {wordmark}
        </span>
      </div>
    </footer>
  );
}
