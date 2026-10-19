import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CantSleepReason = "overthinking" | "miss_someone" | "bad_day" | "random_awake" | "need_company";
export type CantSleepParticipant = { id: string; userId: string; username: string; displayName: string; avatarUrl: string; reason: CantSleepReason; joinedAtMs: number; lastSeenAtMs: number };
export type CantSleepMessageKind = "user" | "capsule" | "system";
export type CantSleepMessage = { id: string; roomId: string; senderId: string; username: string; displayName: string; avatarUrl: string; content: string; kind: CantSleepMessageKind; createdAtMs: number };
type JoinRoomInput = { userId: string; username?: string; displayName?: string; avatarUrl?: string; reason: CantSleepReason };
type SendMessageInput = { roomId: string; senderId: string; username?: string; displayName?: string; avatarUrl?: string; content: string; kind?: CantSleepMessageKind };
type MessageRow = { id: string; room_id: string; sender_id: string; username: string; display_name: string; avatar_url: string | null; content: string; kind: CantSleepMessageKind; created_at: string };

const ROOM_MESSAGE_LIMIT = 80;
const OPEN_HOUR = 2;
const CLOSE_HOUR = 4;
const TEMPORARY_TEST_SKIP_ENABLED = true;
const normalizeUsername = (value?: string) => (value || "dareuser").replace(/^@/, "").trim().slice(0, 40) || "dareuser";
const normalizeDisplayName = (value: string | undefined, username: string) => (value || username || "Dare User").trim().slice(0, 80) || "Dare User";
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const normalizeReason = (value: unknown): CantSleepReason => {
  const reason = String(value || "");
  return ["overthinking", "miss_someone", "bad_day", "random_awake", "need_company"].includes(reason) ? reason as CantSleepReason : "random_awake";
};
const normalizeMessage = (row: MessageRow): CantSleepMessage => ({
  id: row.id, roomId: row.room_id, senderId: row.sender_id,
  username: normalizeUsername(row.username), displayName: normalizeDisplayName(row.display_name, row.username),
  avatarUrl: row.avatar_url || "", content: row.content, kind: row.kind,
  createdAtMs: new Date(row.created_at).getTime(),
});

class CantSleepRoomService {
  private pendingPresence = new Map<string, CantSleepParticipant>();

  getSlot(now = new Date()) {
    if (TEMPORARY_TEST_SKIP_ENABLED) {
      const openAt = new Date(now); openAt.setHours(0, 0, 0, 0);
      const closeAt = addDays(openAt, 1); const localDate = localDateKey(now);
      return { roomId: `cant_sleep_test_${localDate}`, localDate, isOpen: true, openAt, closeAt, expiresAtMs: closeAt.getTime(), nextOpenAt: openAt };
    }
    const openAt = new Date(now); openAt.setHours(OPEN_HOUR, 0, 0, 0);
    const closeAt = new Date(now); closeAt.setHours(CLOSE_HOUR, 0, 0, 0);
    const isOpen = now >= openAt && now < closeAt; const localDate = localDateKey(now);
    const nextOpenAt = now < openAt ? openAt : (() => { const next = addDays(now, 1); next.setHours(OPEN_HOUR, 0, 0, 0); return next; })();
    return { roomId: `cant_sleep_${localDate}`, localDate, isOpen, openAt, closeAt, expiresAtMs: closeAt.getTime(), nextOpenAt };
  }

  subscribeToParticipants(roomId: string | undefined, callback: (participants: CantSleepParticipant[]) => void, onError?: (message: string) => void) {
    if (!roomId) { callback([]); return () => {}; }
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`cant-sleep:${roomId}`, { config: { private: true, presence: { key: this.pendingPresence.get(roomId)?.userId || "viewer" } } });
    let disposed = false;
    const publishState = () => {
      const participants = Object.values(channel.presenceState() as Record<string, unknown[]>).flatMap((entries) => entries).map((entry) => {
        const value = entry as Partial<CantSleepParticipant>; const userId = String(value.userId || "");
        if (!userId) return null; const username = normalizeUsername(value.username);
        return { id: userId, userId, username, displayName: normalizeDisplayName(value.displayName, username), avatarUrl: String(value.avatarUrl || ""), reason: normalizeReason(value.reason), joinedAtMs: Number(value.joinedAtMs || Date.now()), lastSeenAtMs: Date.now() } satisfies CantSleepParticipant;
      }).filter((entry): entry is CantSleepParticipant => entry !== null);
      callback(Array.from(new Map(participants.map((entry) => [entry.userId, entry])).values()));
    };
    channel.on("presence", { event: "sync" }, publishState);
    channel.subscribe(async (status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") { const presence = this.pendingPresence.get(roomId); if (presence) await channel.track(presence); publishState(); onError?.(""); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError?.("The room is quiet right now. Try opening it again.");
    });
    return () => { if (disposed) return; disposed = true; void channel.untrack().finally(() => client.removeChannel(channel)); };
  }

  subscribeToMessages(roomId: string | undefined, callback: (messages: CantSleepMessage[]) => void, onError?: (message: string) => void) {
    if (!roomId) { callback([]); return () => {}; }
    const client = getSupabaseBrowserClient(); const rows = new Map<string, CantSleepMessage>(); let disposed = false;
    const emit = () => callback([...rows.values()].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id)).slice(-ROOM_MESSAGE_LIMIT));
    const channel: RealtimeChannel = client.channel(`cant-sleep-messages:${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "cant_sleep_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
      if (disposed) return; const oldId = String((payload.old as { id?: string }).id || "");
      if (payload.eventType === "DELETE") { if (oldId) rows.delete(oldId); }
      else { const message = normalizeMessage(payload.new as MessageRow); rows.set(message.id, message); }
      emit();
    });
    channel.subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError?.("Messages vanished for this night."); });
    void client.from("cant_sleep_messages").select("id,room_id,sender_id,username,display_name,avatar_url,content,kind,created_at").eq("room_id", roomId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(ROOM_MESSAGE_LIMIT).then(({ data, error }) => {
      if (disposed) return; if (error) { onError?.("Messages vanished for this night."); return; }
      for (const row of (data || []) as MessageRow[]) { const message = normalizeMessage(row); rows.set(message.id, message); }
      emit(); onError?.("");
    });
    return () => { disposed = true; void client.removeChannel(channel); };
  }

  async joinRoom(input: JoinRoomInput) {
    const slot = this.getSlot();
    if (!slot.isOpen) return { success: false, error: "The room opens from 2:00 AM to 4:00 AM." };
    try {
      const client = getSupabaseBrowserClient(); const { data } = await client.auth.getUser();
      if (!data.user || data.user.id !== input.userId) return { success: false, error: "You must be signed in to enter." };
      const { error } = await client.rpc("ensure_cant_sleep_room", { p_room_id: slot.roomId, p_local_date: slot.localDate, p_open_at: slot.openAt.toISOString(), p_close_at: slot.closeAt.toISOString(), p_expires_at: new Date(slot.expiresAtMs).toISOString() });
      if (error) throw error;
      const username = normalizeUsername(input.username); const now = Date.now();
      this.pendingPresence.set(slot.roomId, { id: input.userId, userId: input.userId, username, displayName: normalizeDisplayName(input.displayName, username), avatarUrl: input.avatarUrl || "", reason: input.reason, joinedAtMs: now, lastSeenAtMs: now });
      return { success: true, roomId: slot.roomId };
    } catch (error) { console.warn("Failed to join Can't Sleep room:", error); return { success: false, error: "Could not enter the room. Try again." }; }
  }

  async sendMessage(input: SendMessageInput) {
    const slot = this.getSlot(); const content = input.content.trim();
    if (!slot.isOpen || slot.roomId !== input.roomId) return { success: false, error: "This night's room has vanished." };
    if (!input.senderId) return { success: false, error: "You must be signed in to chat." };
    if (!content) return { success: false, error: "Write something first." };
    if (content.length > 700) return { success: false, error: "Keep night messages under 700 characters." };
    try {
      const client = getSupabaseBrowserClient(); const { data } = await client.auth.getUser();
      if (!data.user || data.user.id !== input.senderId) return { success: false, error: "You must be signed in to chat." };
      const { error } = await client.rpc("send_cant_sleep_message", { p_room_id: input.roomId, p_content: content, p_kind: input.kind || "user" });
      if (error) throw error; return { success: true };
    } catch (error) { console.warn("Failed to send Can't Sleep message:", error); return { success: false, error: "Could not send message. Try again." }; }
  }
}

export const cantSleepRoomService = new CantSleepRoomService();
