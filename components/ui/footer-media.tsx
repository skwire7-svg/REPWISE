"use client";

import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * The row of training shots that sits over the footer wordmark.
 *
 * Layout intent: the cards must not hide the brand name. They are spaced apart
 * rather than overlapped into one mass, and the caller slides the wordmark up
 * behind them so only the *tops* of the letters pass under a card. Letters read
 * fine from their lower two-thirds, and between the cards each letter is fully
 * exposed — so both the photos and the name stay legible.
 *
 * This is a client leaf for one reason: video. The global reduced-motion block
 * in globals.css clamps animations and transitions, but CSS cannot stop a
 * looping <video> — WCAG 2.2.2 wants anything auto-playing past five seconds to
 * be stoppable. So when the user asks for reduced motion the video renders as
 * its poster frame instead of autoplaying. Images need none of that, but they
 * ride along here to keep the row a single component.
 *
 * The middle card is the largest and the only one kept on narrow screens —
 * three portrait cards side by side on a phone would each be a stamp.
 */

export type FooterMediaItem = {
  /** Defaults to "image". */
  type?: "image" | "video";
  src: string;
  alt: string;
  /** Required for videos — shown before playback and when motion is reduced. */
  poster?: string;
};

export function FooterMedia({
  items,
  className,
}: {
  items: FooterMediaItem[];
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (items.length === 0) return null;

  const middle = Math.floor((items.length - 1) / 2);

  return (
    <ul
      className={cn(
        "pointer-events-none flex items-end justify-center gap-3 sm:gap-5 lg:gap-7",
        className,
      )}
    >
      {items.map((item, i) => {
        const isMiddle = i === middle;
        const offset = i - middle;

        return (
          <li
            key={`${item.src}-${i}`}
            style={{
              // Flanking cards tilt away from centre and ride a little lower,
              // so the row reads as an arranged group rather than a filmstrip.
              transform: isMiddle
                ? undefined
                : `rotate(${offset * 4}deg) translateY(${Math.abs(offset) * 10}px)`,
            }}
            className={cn(
              "relative aspect-[3/4] shrink-0 overflow-hidden",
              "border border-line bg-surface-2 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)]",
              isMiddle
                ? "z-20 w-[clamp(10rem,18vw,15rem)] rounded-[1.5rem]"
                : "z-10 hidden w-[clamp(8rem,13vw,11.5rem)] rounded-[1.25rem] sm:block",
            )}
          >
            {item.type === "video" ? (
              <video
                src={item.src}
                poster={item.poster}
                autoPlay={!reduce}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={item.alt}
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
