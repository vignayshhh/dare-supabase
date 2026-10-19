export type RefreshReason = string;
export type RefreshController = { requestRefresh: (reason?: RefreshReason) => void; setVisible: (visible: boolean) => void; dispose: () => void };
type RefreshLoader = (signal: AbortSignal, reason?: RefreshReason) => Promise<unknown>;

// `degraded` changes the retry delay, but a concrete interaction or revision
// gap is more actionable and must promote that delayed retry.
const reasonPriority: Record<string, number> = { initial: 10, visible: 20, degraded: 25, connected: 30, interaction: 40, "revision-gap": 60 };
const strongerReason = (current: RefreshReason | undefined, next: RefreshReason) =>
  !current || (reasonPriority[next] ?? 35) >= (reasonPriority[current] ?? 35) ? next : current;

/** Single-flight, visibility-aware refresh coordinator for realtime resources. */
export function createRefreshController(loader: RefreshLoader, onResult: (value: unknown) => void, delayMs = 100): RefreshController {
  let disposed = false; let visible = true; let dirty = false; let inFlight = false; let abort: AbortController | null = null;
  let pendingReason: RefreshReason | undefined; let timer: ReturnType<typeof setTimeout> | null = null; let timerDueAt = 0;
  const cancelTimer = () => { if (timer) clearTimeout(timer); timer = null; timerDueAt = 0; };
  const delayFor = (reason?: RefreshReason) => reason === "degraded" ? Math.max(delayMs, 5000) : delayMs;
  const schedule = () => {
    if (disposed || !visible || inFlight || !dirty) return;
    const dueAt = Date.now() + delayFor(pendingReason);
    // Promote queued degraded recovery when a stronger event arrives; never extend it.
    if (timer && timerDueAt <= dueAt) return;
    cancelTimer(); timerDueAt = dueAt;
    timer = setTimeout(() => { timer = null; timerDueAt = 0; void run(); }, Math.max(0, dueAt - Date.now()));
  };
  const run = async () => {
    if (disposed || !visible || inFlight) return;
    inFlight = true; dirty = false; const reason = pendingReason ?? "requested"; pendingReason = undefined; abort = new AbortController();
    try { const result = await loader(abort.signal, reason); if (!disposed && !abort.signal.aborted) onResult(result); } catch { /* keep last good snapshot */ }
    finally { inFlight = false; abort = null; if (!disposed && visible && dirty) schedule(); }
  };
  return {
    requestRefresh: (reason = "requested") => { if (!disposed) { dirty = true; pendingReason = strongerReason(pendingReason, reason); schedule(); } },
    setVisible: (next) => { if (disposed) return; visible = next; if (!next) { cancelTimer(); abort?.abort(); return; } pendingReason = strongerReason(pendingReason, "visible"); dirty = true; schedule(); },
    dispose: () => { if (disposed) return; disposed = true; cancelTimer(); abort?.abort(); },
  };
}
