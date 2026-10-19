export type RefreshScheduler = {
  schedule: () => void;
  cancel: () => void;
};

/** Coalesce bursts of Postgres-change events into one bounded refresh. */
export function scheduleRefresh(refresh: () => void, delayMs = 40): RefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule: () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, delayMs);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
