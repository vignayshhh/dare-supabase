import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const STICKMAN_STATUS_OPTIONS = [
  { id: "available", label: "Around", detail: "Open to chaos" },
  { id: "sleeping", label: "Sleeping", detail: "Do not disturb" },
  { id: "watching-tv", label: "Watching TV", detail: "One more episode" },
  { id: "studying", label: "Studying", detail: "Locked in" },
  { id: "gaming", label: "Gaming", detail: "In the lobby" },
  { id: "working", label: "Working", detail: "Getting things done" },
  { id: "music", label: "Listening", detail: "Headphones on" },
  { id: "eating", label: "Eating", detail: "Currently unavailable" },
  { id: "gym", label: "At the gym", detail: "One more rep" },
  { id: "commuting", label: "On the move", detail: "Be there soon" },
  { id: "partying", label: "Out out", detail: "Bad ideas pending" },
  { id: "chilling", label: "Chilling", detail: "Doing absolutely nothing" },
  { id: "coffee", label: "Coffee run", detail: "Restoring function" },
] as const;

export type StickmanStatusId =
  (typeof STICKMAN_STATUS_OPTIONS)[number]["id"];

export interface StickmanStatusSnapshot {
  id: StickmanStatusId;
  label: string;
  detail: string;
  updatedAt: unknown;
}

export const DEFAULT_STICKMAN_STATUS = STICKMAN_STATUS_OPTIONS[0];

const statusById = new Map(
  STICKMAN_STATUS_OPTIONS.map((status) => [status.id, status]),
);

export function getStickmanStatus(id: unknown) {
  return statusById.get(id as StickmanStatusId) ?? DEFAULT_STICKMAN_STATUS;
}

function normalizeStatus(data: Record<string, unknown>): StickmanStatusSnapshot {
  const option = getStickmanStatus(data.stickman_status_id);
  return {
    ...option,
    updatedAt: data.stickman_status_updated_at ?? null,
  };
}

class StickmanStatusService {
  subscribe(
    userIds: string[],
    callback: (statuses: Record<string, StickmanStatusSnapshot>) => void,
  ) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))].slice(0, 10);
    if (uniqueIds.length === 0) {
      callback({});
      return () => {};
    }

    const client = getSupabaseBrowserClient();
    const statuses: Record<string, StickmanStatusSnapshot> = {};
    let disposed = false;
    const emit = () => callback({ ...statuses });
    const load = async () => {
      const { data, error } = await client.from("profiles")
        .select("id,stickman_status_id,stickman_status_updated_at")
        .in("id", uniqueIds);
      if (disposed) return;
      if (error) { console.error("Unable to load stickman statuses:", error); callback({}); return; }
      for (const profile of data || []) statuses[profile.id] = normalizeStatus(profile);
      emit();
    };
    const channel = client.channel(`profile-statuses:${uniqueIds.slice().sort().join(":")}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=in.(${uniqueIds.join(",")})` },
      (payload) => {
        if (disposed) return;
        const profile = payload.new as Record<string, unknown> & { id?: string };
        if (profile.id && uniqueIds.includes(profile.id)) { statuses[profile.id] = normalizeStatus(profile); emit(); }
      },
    );
    channel.subscribe();
    void load();
    return () => { disposed = true; void client.removeChannel(channel); };
  }

  async update(userId: string, statusId: StickmanStatusId) {
    const status = getStickmanStatus(statusId);
    const client = getSupabaseBrowserClient();
    const { data } = await client.auth.getUser();
    if (!data.user || data.user.id !== userId) throw new Error("Not authorized");
    const now = new Date().toISOString();
    const { error } = await client.from("profiles").update({ stickman_status_id: status.id, stickman_status_updated_at: now, updated_at: now }).eq("id", userId);
    if (error) throw error;
    return status;
  }
}

export const stickmanStatusService = new StickmanStatusService();
