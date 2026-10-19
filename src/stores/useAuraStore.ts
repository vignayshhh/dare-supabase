import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";

export type AuraEvent = {
  id: string;
  kind: string;
  amount: number;
  title: string;
  message: string;
  sourceType: string;
  sourceId: string;
  currentAuraAfter: number;
  lifetimeAuraAfter: number;
  celebrated: boolean;
  createdAt: string;
};

type AuraResponse = {
  currentAura?: number;
  lifetimeAura?: number;
  events: AuraEvent[];
  pendingEvent: AuraEvent | null;
};

type AuraState = Omit<AuraResponse, "currentAura" | "lifetimeAura"> & {
  currentAura: number;
  lifetimeAura: number;
  loading: boolean;
  loadedForUserId: string | null;
  sheetOpen: boolean;
  celebration: AuraEvent | null;
  load: (userId: string, options?: { showPending?: boolean; history?: boolean; balance?: boolean }) => Promise<void>;
  receiveLiveEvent: (event: AuraEvent) => void;
  openSheet: () => void;
  closeSheet: () => void;
  dismissCelebration: () => Promise<void>;
  reset: () => void;
};

let inFlight: {
  userId: string;
  history: boolean;
  includeBalance: boolean;
  promise: Promise<void>;
} | null = null;

export const useAuraStore = create<AuraState>((set, get) => ({
  currentAura: 100,
  lifetimeAura: 100,
  events: [],
  pendingEvent: null,
  loading: false,
  loadedForUserId: null,
  sheetOpen: false,
  celebration: null,

  load: async (userId, options = {}) => {
    if (!userId) return;
    const history = options.history === true;
    const includeBalance = options.balance !== false;
    if (
      inFlight?.userId === userId &&
      inFlight.history === history &&
      inFlight.includeBalance === includeBalance
    ) {
      return inFlight.promise;
    }
    set({ loading: true });
    const params = new URLSearchParams();
    if (history) params.set("history", "1");
    if (!includeBalance) params.set("balance", "0");
    const request = apiFetch<AuraResponse>(`/api/aura${params.toString() ? `?${params}` : ""}`, {
      method: "GET",
      skipCsrf: true,
    } as RequestInit & { skipCsrf?: boolean })
      .then((response) => {
        set((state) => ({
          currentAura: response.currentAura ?? state.currentAura,
          lifetimeAura: response.lifetimeAura ?? state.lifetimeAura,
          events: history
            ? response.events
            : response.pendingEvent
              ? [
                  response.pendingEvent,
                  ...state.events.filter((item) => item.id !== response.pendingEvent?.id),
                ]
              : state.events,
          pendingEvent: response.pendingEvent,
          loadedForUserId: userId,
          celebration:
            options.showPending === false
              ? state.celebration
              : state.celebration || response.pendingEvent,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (inFlight?.promise === request) inFlight = null;
        set({ loading: false });
      });
    inFlight = { userId, history, includeBalance, promise: request };
    return request;
  },

  receiveLiveEvent: (event) =>
    set((state) => {
      const events = [event, ...state.events.filter((item) => item.id !== event.id)];
      const pendingEvent = events.find((item) => !item.celebrated) || null;
      return {
        currentAura: event.currentAuraAfter,
        lifetimeAura: Math.max(state.lifetimeAura, event.lifetimeAuraAfter),
        events,
        pendingEvent,
        celebration:
          !event.celebrated && !state.celebration
            ? event
            : state.celebration,
      };
    }),

  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  dismissCelebration: async () => {
    const event = get().celebration;
    set((state) => ({
      celebration: null,
      pendingEvent: null,
      events: state.events.map((item) =>
        item.id === event?.id ? { ...item, celebrated: true } : item,
      ),
    }));
    if (!event) return;
    await apiFetch("/api/aura", {
      method: "PATCH",
      body: JSON.stringify({ eventId: event.id }),
    }).catch(() => {});
    const userId = get().loadedForUserId;
    const nextPending = get().events.find((item) => !item.celebrated) || null;
    if (nextPending) {
      set({ pendingEvent: nextPending, celebration: nextPending });
    } else if (userId) {
      await get().load(userId, { showPending: true, balance: false });
    }
  },
  reset: () => {
    inFlight = null;
    set({
      currentAura: 100,
      lifetimeAura: 100,
      events: [],
      pendingEvent: null,
      loadedForUserId: null,
      sheetOpen: false,
      celebration: null,
    });
  },
}));
