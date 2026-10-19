// Alert Store - Single source of truth for all alert data
// Uses service factory and follows architecture contract strictly
// UI components only interact with this store - never directly with services

import { create } from "zustand";
import { alertService } from "@/middleware/services/service-factory";
import { AlertEntity, AlertType } from "@/backend/domain/entities/Alert";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordResourceMetric } from "@/lib/observability/resourceMetrics";

let activeAlertsUserId: string | null = null;
let activeAlertsUnsubscribe: (() => void) | null = null;
let activeAlertsSubscriberCount = 0;
let activeAlertsGeneration = 0;
const BACKGROUND_ALERT_LIMIT = 5;
const FOREGROUND_ALERT_LIMIT = 50;

const mapAlertRow = (data: any): AlertEntity => {
  if (data instanceof AlertEntity) return data;
  const payload = data.payload || data.metadata || {};
  return AlertEntity.create({
    id: data.id || "",
    userId: data.recipient_id || data.userId || "",
    type: data.type || "SYSTEM_NOTIFICATION",
    entityId: payload.entityId || data.entityId || "",
    actorId: data.actor_id || data.actorId || "",
    message: payload.message || data.message || "",
    metadata: payload.metadata || payload,
    isRead: Boolean(data.read_at) || Boolean(data.isRead),
    createdAt: data.created_at || data.createdAt || new Date().toISOString(),
    updatedAt:
      data.read_at || data.updatedAt || data.created_at || new Date().toISOString(),
  });
};

const fetchAlertPage = async (userId: string, limit: number) => {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.rpc("get_alert_page", {
    p_limit: Math.max(1, Math.min(limit, 100)),
  });
  if (!error && data) {
    const payload = data as { items?: any[]; unread_count?: number };
    return {
      alerts: (payload.items || []).map(mapAlertRow),
      unreadCount: Number(payload.unread_count) || 0,
    };
  }

  // Upgrade-safe fallback until forward migration is applied.
  const [alertsResult, unreadResult] = await Promise.all([
    client
      .from("alerts")
      .select("id,recipient_id,actor_id,type,payload,read_at,created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
    client
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null),
  ]);
  if (alertsResult.error) throw alertsResult.error;
  if (unreadResult.error) throw unreadResult.error;
  return {
    alerts: (alertsResult.data || []).map(mapAlertRow),
    unreadCount: unreadResult.count ?? 0,
  };
};

interface AlertState {
  // Data
  alerts: AlertEntity[];
  unreadCount: number;

  // Loading states
  loading: boolean;
  refreshing: boolean;

  // Error states
  error: string | null;

  // Pagination
  hasMore: boolean;
  olderCursor: { id: string; createdAt: string } | null;
  paginationUserId: string | null;
  lastLoadedAt?: string;

  // Actions
  loadAlerts: (refresh?: boolean) => Promise<void>;
  loadOlderAlerts: () => Promise<void>;
  subscribeToAlerts: (userId: string, realtimeLimit?: number) => () => void;
  markAsRead: (alertId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
  refreshAlerts: () => Promise<void>;
  clearErrors: () => void;

  // Utility actions
  getAlertsByType: (type: AlertType) => AlertEntity[];
  getUnreadAlerts: () => AlertEntity[];
  getSocialAlerts: () => AlertEntity[];
  getDareAlerts: () => AlertEntity[];
  getTruthAlerts: () => AlertEntity[];
}

export const useAlertStore = create<AlertState>((set, get) => ({
  // Initial state
  alerts: [],
  unreadCount: 0,
  loading: false,
  refreshing: false,
  error: null,
  hasMore: true,
  olderCursor: null,
  paginationUserId: null,

  // Load alerts
  loadAlerts: async (refresh = false) => {
    const { loading, alerts } = get();

    // Prevent duplicate loads
    if (loading && !refresh) return;

    set({
      loading: true,
      error: null,
      refreshing: refresh,
    });

    try {
      // Get current user from auth store
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      if (
        refresh &&
        get().paginationUserId === currentUser.id &&
        get().lastLoadedAt &&
        Date.now() - new Date(get().lastLoadedAt!).getTime() < 30_000 &&
        get().alerts.length >= FOREGROUND_ALERT_LIMIT
      ) {
        recordResourceMetric("cache_hits");
        set({ loading: false, refreshing: false });
        return;
      }

      recordResourceMetric("cache_misses");
      const page = await fetchAlertPage(
        currentUser.id,
        refresh ? FOREGROUND_ALERT_LIMIT : 20,
      );
      const alertEntities = page.alerts.filter(
        (alertData) => alertData.type !== "STORY_REPLY",
      );

        const mergedAlerts = refresh
          ? alertEntities
          : [...alerts, ...alertEntities];

        set({
          alerts: mergedAlerts,
          unreadCount: page.unreadCount,
          loading: false,
          refreshing: false,
          hasMore: page.alerts.length === (refresh ? FOREGROUND_ALERT_LIMIT : 20),
          olderCursor: page.alerts.length ? {
            id: page.alerts[page.alerts.length - 1].id,
            createdAt: page.alerts[page.alerts.length - 1].createdAt,
          } : null,
          paginationUserId: currentUser.id,
          lastLoadedAt: new Date().toISOString(),
        });
    } catch (error) {
      console.error("âŒ AlertStore: Error loading alerts:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load alerts";
      set({
        error: errorMessage,
        loading: false,
        refreshing: false,
      });
    }
  },

  loadOlderAlerts: async () => {
    const state = get();
    if (state.loading || !state.hasMore || !state.olderCursor) return;
    const { useAuthStore } = await import("./useAuthStore-v2");
    const uid = useAuthStore.getState().user?.id;
    if (!uid || uid !== state.paginationUserId) return;
    set({ loading: true, error: null });
    try {
      const cursor = state.olderCursor;
      const timestamp = new Date(cursor.createdAt).toISOString();
      const { data, error } = await getSupabaseBrowserClient().from("alerts")
        .select("id,recipient_id,actor_id,type,payload,read_at,created_at")
        .eq("recipient_id", uid)
        .or(`created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${cursor.id})`)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .limit(FOREGROUND_ALERT_LIMIT);
      if (error) throw error;
      if (useAuthStore.getState().user?.id !== uid) return;
      const page = (data || []).map(mapAlertRow);
      set((current) => ({
        alerts: [...current.alerts, ...page.filter((alert) => alert.type !== "STORY_REPLY" && !current.alerts.some((existing) => existing.id === alert.id))],
        hasMore: page.length === FOREGROUND_ALERT_LIMIT,
        olderCursor: page.length ? { id: page[page.length - 1].id, createdAt: page[page.length - 1].createdAt } : current.olderCursor,
        loading: false,
      }));
    } catch (error) {
      if (useAuthStore.getState().user?.id === uid) {
        set({ loading: false, error: error instanceof Error ? error.message : "Could not load older alerts" });
      }
    }
  },

  // Subscribe to real-time alerts
  subscribeToAlerts: (userId: string) => {
    if (activeAlertsUserId === userId && activeAlertsUnsubscribe) {
      activeAlertsSubscriberCount += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (
          activeAlertsUserId === userId &&
          activeAlertsUnsubscribe &&
          --activeAlertsSubscriberCount <= 0
        ) {
          activeAlertsSubscriberCount = 0;
          activeAlertsUnsubscribe();
        }
      };
    }

    activeAlertsUnsubscribe?.();
    let released = false;
    const generation = ++activeAlertsGeneration;
    const client = getSupabaseBrowserClient();
    const commitAlerts = (
      alerts: AlertEntity[],
      unreadCountOverride?: number,
    ) => {
      const retainedLimit = get().alerts.length > FOREGROUND_ALERT_LIMIT ? alerts.length : Math.max(
        BACKGROUND_ALERT_LIMIT,
        Math.min(
          FOREGROUND_ALERT_LIMIT,
          get().alerts.length || BACKGROUND_ALERT_LIMIT,
        ),
      );
      const bounded = alerts
        .filter((alert) => alert.type !== "STORY_REPLY")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
            b.id.localeCompare(a.id),
        )
        .slice(0, retainedLimit);
      set({
        alerts: bounded,
        unreadCount:
          unreadCountOverride ?? bounded.filter((alert) => !alert.isRead).length,
        loading: false,
        refreshing: false,
        error: null,
        lastLoadedAt: new Date().toISOString(),
      });
    };
    const channel = client
      .channel(`alerts:${userId}`, { config: { private: true } })
      .on(
        "broadcast",
        { event: "alert_changed" },
        ({ payload }) => {
          recordResourceMetric("realtime_messages");
          const message = payload as { operation?: string; record?: Record<string, unknown> };
          const row = message.record;
          if (!row || String(row.recipient_id || "") !== userId) return;
          const current = get().alerts;
          const id = String(row.id || "");
          if (message.operation === "DELETE") {
            commitAlerts(current.filter((alert) => alert.id !== id));
            return;
          }
          const incoming = mapAlertRow(row);
          commitAlerts([
            incoming,
            ...current.filter((alert) => alert.id !== incoming.id),
          ]);
        },
      );

    activeAlertsUserId = userId;
    activeAlertsSubscriberCount = 1;
    let initialLoadTimer: ReturnType<typeof setTimeout> | null = null;
    activeAlertsUnsubscribe = () => {
      if (initialLoadTimer) clearTimeout(initialLoadTimer);
      void client.removeChannel(channel);
      if (activeAlertsGeneration === generation) {
        activeAlertsUnsubscribe = null;
        activeAlertsUserId = null;
        activeAlertsSubscriberCount = 0;
      }
    };
    initialLoadTimer = setTimeout(() => {
      if (get().loading || get().alerts.length > 0) return;
      void fetchAlertPage(userId, BACKGROUND_ALERT_LIMIT)
        .then((page) => {
          if (!released && generation === activeAlertsGeneration) {
            commitAlerts(page.alerts, page.unreadCount);
          }
        })
        .catch((error) => {
          if (!released && generation === activeAlertsGeneration) {
            set({
              error:
                error instanceof Error ? error.message : "Failed to load alerts",
              loading: false,
            });
          }
        });
    }, 0);
    recordResourceMetric("realtime_joins");
    void channel.subscribe();

    return () => {
      if (released) return;
      released = true;
      if (activeAlertsUserId === userId && activeAlertsUnsubscribe) {
        activeAlertsSubscriberCount -= 1;
        if (activeAlertsSubscriberCount <= 0) {
          activeAlertsSubscriberCount = 0;
          activeAlertsUnsubscribe();
        }
      }
    };
  },

  // Mark alert as read
  markAsRead: async (alertId: string) => {
    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.markAlertAsRead({
        alertId,
        userId: currentUser.id,
      });

      if (response.success) {
        // Update local state - create new AlertEntity instances
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === alertId ? alert.markAsRead() : alert,
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      } else {
        throw new Error("Failed to mark alert as read");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to mark alert as read";
      set({ error: errorMessage });
    }
  },

  // Mark all alerts as read
  markAllAsRead: async () => {
    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.markAllAlertsAsRead(currentUser.id);

      if (response.success) {
        // Update local state - create new AlertEntity instances
        set((state) => ({
          alerts: state.alerts.map((alert) => alert.markAsRead()),
          unreadCount: 0,
        }));
      } else {
        throw new Error("Failed to mark all alerts as read");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to mark all alerts as read";
      set({ error: errorMessage });
    }
  },

  // Delete alert
  deleteAlert: async (alertId: string) => {
    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.deleteAlert(alertId, currentUser.id);

      if (response.success) {
        // Update local state
        const alertToDelete = get().alerts.find(
          (alert) => alert.id === alertId,
        );
        set((state) => ({
          alerts: state.alerts.filter((alert) => alert.id !== alertId),
          unreadCount:
            alertToDelete && !alertToDelete.isRead
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
        }));
      } else {
        throw new Error("Failed to delete alert");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete alert";
      set({ error: errorMessage });
    }
  },

  // Refresh alerts
  refreshAlerts: async () => {
    set({ refreshing: true });
    await get().loadAlerts(true);
    set({ refreshing: false });
  },

  // Clear errors
  clearErrors: () => {
    set({ error: null });
  },

  // Utility methods
  getAlertsByType: (type: AlertType) => {
    return get().alerts.filter((alert) => alert.type === type);
  },

  getUnreadAlerts: () => {
    return get().alerts.filter((alert) => !alert.isRead);
  },

  getSocialAlerts: () => {
    return get().alerts.filter((alert) => alert.isSocialAlert());
  },

  getDareAlerts: () => {
    return get().alerts.filter((alert) => alert.isDareRelated());
  },

  getTruthAlerts: () => {
    return get().alerts.filter((alert) => alert.isTruthRelated());
  },
}));
