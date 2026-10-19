export const LIKE_DANCE_INTERVAL = 50;
export const LIKE_COLOR_INTERVAL = 15;

export const likeDanceVariant = (milestone: number): "groove" | "shuffle" =>
  Math.floor(milestone / LIKE_DANCE_INTERVAL) % 2 === 0 ? "shuffle" : "groove";

// Keep the default pink out of the intermediate stages. The Circle rose
// accent is too similar to it and made the wine-to-rose step look like a reset.
// Default pink → wine → lavender → blue → green → gold → default pink.
export const FEED_HEART_PALETTE = [
  "#ff3b6b", "#9f3455", "#c084fc", "#38bdf8", "#4ade80", "#facc15",
] as const;

export function feedHeartColor(taps: number): string {
  const count = Math.max(0, Math.floor(taps));
  const stage = Math.floor(count / LIKE_COLOR_INTERVAL);
  if (stage === 0) return FEED_HEART_PALETTE[0];
  const from = FEED_HEART_PALETTE[(stage - 1) % FEED_HEART_PALETTE.length];
  const to = FEED_HEART_PALETTE[stage % FEED_HEART_PALETTE.length];
  // Ease into each new shade over the first five likes of its 15-like stage.
  const progress = Math.min(1, ((count % LIKE_COLOR_INTERVAL) + 1) / 5);
  const blend = progress * progress * (3 - 2 * progress);
  return `#${[1, 3, 5].map((offset) => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * blend).toString(16).padStart(2, "0");
  }).join("")}`;
}

// A single seamless media loop stays alive throughout a run of likes. Taps
// retarget its pitch/volume without restarting playback or adding new voices.
export function createFeedLikeFeedback() {
  let voice: HTMLAudioElement | null = null;
  let frame: number | null = null;
  let lastTap = -Infinity;
  let nextHapticAt = -Infinity;
  let hapticPriority = 0;
  let lastFrame = 0;
  let streak = 0;
  let active = false;
  let disposed = false;
  const holdMs = 550;
  const releaseMs = 300;

  const stop = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    active = false;
    if (voice) { voice.pause(); voice.volume = 0; }
  };

  const update = () => {
    if (disposed || !voice || !active) { frame = null; return; }
    const now = performance.now();
    const idle = now - lastTap;
    if (document.hidden || idle >= holdMs + releaseMs) { stop(); return; }
    const blend = 1 - Math.exp(-Math.min(64, now - lastFrame) / 90);
    lastFrame = now;
    const energy = Math.min(streak / 50, 1);
    const release = Math.max(0, 1 - Math.max(0, idle - holdMs) / releaseMs);
    const targetVolume = (0.45 + energy * 0.15) * release;
    voice.volume += (targetVolume - voice.volume) * blend;
    voice.playbackRate += (1 + energy * 0.45 - voice.playbackRate) * blend;
    frame = window.requestAnimationFrame(update);
  };

  const onVisibilityChange = () => { if (document.hidden) stop(); };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    play(taps: number) {
      if (disposed) return;
      const now = performance.now();
      streak = now - lastTap >= holdMs + releaseMs ? 1 : streak + 1;
      lastTap = now;
      const milestone = taps % LIKE_DANCE_INTERVAL === 0;
      const colorMilestone = taps % LIKE_COLOR_INTERVAL === 0;
      const priority = milestone ? 2 : colorMilestone ? 1 : 0;
      try {
        if ((now >= nextHapticAt || priority > hapticPriority) && typeof navigator.vibrate === "function") {
          // Tap -> soft double beat -> three-beat celebration. Build duration
          // gently during a run, with breathing room instead of a constant buzz.
          const pattern = milestone
            ? [25, 30, 40, 35, 65]
            : colorMilestone
              ? [25, 30, 45]
              : [40 + Math.min(8, Math.floor(streak / 5) * 4)];
          const accepted = navigator.vibrate(pattern);
          if (accepted) {
            const duration = pattern.reduce((total, part) => total + part, 0);
            nextHapticAt = now + Math.max(100, duration + 35);
            hapticPriority = priority;
          }
          // Milestones can replace a normal tap; ordinary taps cannot cut
          // short the richer pattern when the user keeps liking rapidly.
        }
      } catch { /* Unsupported haptics must never interrupt likes. */ }
      try {
        if (!voice) {
          voice = new Audio("/audio/likes/bubble-flow.wav?v=1");
          voice.loop = true;
          voice.preload = "auto";
          voice.muted = false;
          voice.preservesPitch = false;
        }
        if (!active) {
          voice.volume = 0.08;
          voice.playbackRate = 1;
          active = true;
          // Start directly in the gesture; subsequent likes only extend the loop.
          void voice.play().then(() => {
            if (disposed || performance.now() - lastTap >= holdMs + releaseMs) stop();
          }).catch(() => { stop(); });
        }
        if (frame === null) {
          lastFrame = now;
          frame = window.requestAnimationFrame(update);
        }
      } catch { stop(); /* Retry on the next gesture if media creation failed. */ }
    },
    dispose() {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (voice) {
        voice.removeAttribute("src");
        voice.load();
      }
      voice = null;
    },
  };
}
