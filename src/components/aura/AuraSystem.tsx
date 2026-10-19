"use client";

import { useEffect, useState } from "react";
import { Flame, LockKeyhole, Sparkles, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { type AuraEvent, useAuraStore } from "@/stores/useAuraStore";
import styles from "./AuraSystem.module.css";

const formatAura = (value: number) => Math.max(0, value).toLocaleString();

const mapAuraEvent = (data: Record<string, unknown>): AuraEvent => ({
  id: String(data.id || ""),
  kind: String(data.kind || ""),
  amount: Number(data.delta || 0),
  title: String(data.title || "Aura update"),
  message: String(data.message || ""),
  sourceType: String(data.source_type || ""),
  sourceId: String(data.source_id || ""),
  currentAuraAfter: Number(data.current_aura_after || 0),
  lifetimeAuraAfter: Number(data.lifetime_aura_after || 0),
  celebrated: Boolean(data.celebrated_at),
  createdAt: String(data.created_at || new Date().toISOString()),
});

function useLockedBody(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

function useAnimatedAmount(amount: number) {
  const [display, setDisplay] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? Math.abs(amount)
      : 0,
  );
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const target = Math.abs(amount);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 760);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [amount]);
  return display;
}

export function AuraEventModal({
  event,
  onClose,
}: {
  event: AuraEvent;
  onClose: () => void;
}) {
  const negative = event.amount < 0;
  const displayAmount = useAnimatedAmount(event.amount);
  useLockedBody(true);
  return (
    <div className={styles.eventBackdrop} role="presentation">
      <section
        className={`${styles.eventCard} ${negative ? styles.eventCardNegative : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aura-event-title"
      >
        {!negative && (
          <span className={styles.sparkField} aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        )}
        <div className={styles.eventGlyph} aria-hidden="true">
          {negative ? <LockKeyhole size={27} /> : <Flame size={28} />}
        </div>
        <p className={styles.eventLabel}>{negative ? "Aura adjusted" : "Aura earned"}</p>
        <h2 className={styles.eventHeading} id="aura-event-title">{event.title}</h2>
        <p className={styles.heroAmount} aria-label={`${event.amount} Aura`}>
          {negative ? "âˆ’" : "+"}{formatAura(displayAmount)}
        </p>
        <p className={styles.heroUnit}>AURA</p>
        <p className={styles.eventMessage}>&ldquo;{event.message}&rdquo;</p>
        <button type="button" className={styles.doneButton} onClick={onClose} autoFocus>
          {negative ? "Got it" : "Nice"}
        </button>
      </section>
    </div>
  );
}

function AuraSheet() {
  const {
    currentAura,
    lifetimeAura,
    events,
    sheetOpen,
    closeSheet,
  } = useAuraStore();
  useLockedBody(sheetOpen);
  if (!sheetOpen) return null;
  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && closeSheet()}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="aura-sheet-title">
        <div className={styles.handle} />
        <header className={styles.sheetHeader}>
          <div>
            <p className={styles.eyebrow}>Your energy</p>
            <h2 className={styles.sheetTitle} id="aura-sheet-title">Aura</h2>
          </div>
          <button className={styles.close} type="button" onClick={closeSheet} aria-label="Close Aura details">
            <X size={19} />
          </button>
        </header>
        <div className={styles.balances}>
          <div className={styles.balance}>
            <span className={styles.balanceLabel}>Current Aura</span>
            <strong className={styles.balanceValue}>âœ¨ {formatAura(currentAura)}</strong>
            <span className={styles.balanceHint}>Can rise or fall</span>
          </div>
          <div className={styles.balance}>
            <span className={styles.balanceLabel}>Lifetime Aura</span>
            <strong className={styles.balanceValue}>{formatAura(lifetimeAura)}</strong>
            <span className={styles.balanceHint}>Only goes up</span>
          </div>
        </div>
        <div className={styles.history}>
          <h3 className={styles.historyTitle}>Recent Aura</h3>
          {events.length ? events.map((event) => {
            const negative = event.amount < 0;
            const date = new Date(event.createdAt);
            return (
              <div key={event.id} className={`${styles.eventRow} ${negative ? styles.negative : ""}`}>
                <span className={styles.eventIcon} aria-hidden="true">
                  {negative ? <LockKeyhole size={18} /> : <Sparkles size={18} />}
                </span>
                <div>
                  <p className={styles.eventTitle}>{event.title}</p>
                  <p className={styles.eventDate}>{Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                <strong className={styles.eventAmount}>{event.amount < 0 ? "âˆ’" : "+"}{formatAura(Math.abs(event.amount))}</strong>
              </div>
            );
          }) : <p className={styles.empty}>Your next real moment will show up here.</p>}
        </div>
      </section>
    </div>
  );
}

export function AuraSystemHost() {
  const userId = useAuthStore((state) => state.user?.id || "");
  const sheetOpen = useAuraStore((state) => state.sheetOpen);
  const load = useAuraStore((state) => state.load);
  const reset = useAuraStore((state) => state.reset);
  const receiveLiveEvent = useAuraStore((state) => state.receiveLiveEvent);
  const celebration = useAuraStore((state) => state.celebration);
  const dismissCelebration = useAuraStore((state) => state.dismissCelebration);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    void load(userId, { showPending: true });
    const client = getSupabaseBrowserClient();
    let active = true;
    const channel = client.channel(`aura-events:${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "aura_events", filter: `user_id=eq.${userId}` }, (payload) => {
      if (!active) return;
      receiveLiveEvent(mapAuraEvent((payload.new || {}) as Record<string, unknown>));
    }).subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [load, receiveLiveEvent, reset, userId]);

  useEffect(() => {
    if (sheetOpen && userId) {
      void load(userId, { history: true, balance: false, showPending: false });
    }
  }, [load, sheetOpen, userId]);

  return (
    <>
      <AuraSheet />
      {celebration && <AuraEventModal key={celebration.id} event={celebration} onClose={() => void dismissCelebration()} />}
    </>
  );
}
