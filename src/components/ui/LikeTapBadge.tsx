"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Heart } from "lucide-react";
import styles from "./LikeTapBadge.module.css";

interface LikeTapBadgeProps {
  count: number;
  actorId: string;
  actorName: string;
  color: string;
  side?: "left" | "right";
  onOpen?: () => void;
}

const compactCount = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function LikeTapBadge({ count, actorId, actorName, color, side = "left", onOpen }: LikeTapBadgeProps) {
  const faceRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const previousRef = useRef({ count, actorId });

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { count, actorId };
    const delta = count - previous.count;
    if (actorId !== previous.actorId || delta <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const face = faceRef.current;
    const number = countRef.current;
    const increment = deltaRef.current;
    if (!face?.animate || !number || !increment) return;
    const milestone = Math.floor(count / 50) > Math.floor(previous.count / 50);
    increment.textContent = `+${delta}`;
    // The displayed number is always current. Superseded motion is cancelled,
    // so fast taps never queue old numbers or delay the next interaction.
    const animations = [
      face.animate([
        { transform: "scale(0.96, 0.92)" },
        { transform: milestone ? "scale(1.12, 1.08)" : "scale(1.06, 1.04)", offset: 0.45 },
        { transform: "scale(1)" },
      ], { duration: milestone ? 340 : 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }),
      number.animate([
        { transform: "translateY(9px)", opacity: 0.3 },
        { transform: "translateY(0)", opacity: 1 },
      ], { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }),
      increment.animate([
        { transform: "translateY(2px) rotate(6deg)", opacity: 0 },
        { transform: "translateY(-5px) rotate(6deg)", opacity: 1, offset: 0.2 },
        { transform: "translateY(-22px) rotate(10deg)", opacity: 0 },
      ], { duration: 480, easing: "ease-out" }),
    ];
    return () => animations.forEach((animation) => animation.cancel());
  }, [count, actorId]);

  return (
    <button
      type="button"
      className={styles.badge}
      data-side={side}
      style={{ "--like-accent": color } as CSSProperties}
      aria-label={`${actorName} liked ${count} times. Open likes`}
      onClick={(event) => { event.stopPropagation(); onOpen?.(); }}
    >
      <span className={styles.backing} aria-hidden="true" />
      <span className={styles.face} ref={faceRef} aria-hidden="true">
        <Heart className={styles.heart} size={23} fill="currentColor" strokeWidth={1.5} />
        <span className={styles.copy}>
          <span className={styles.numberWindow}>
            <span className={styles.count} ref={countRef}>{compactCount.format(count)}</span>
            <span className={styles.multiplier}>×</span>
          </span>
        </span>
        <span className={styles.glint}>✦</span>
      </span>
      <span ref={deltaRef} className={styles.delta} aria-hidden="true" />
    </button>
  );
}
