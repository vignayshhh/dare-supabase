import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Unsubscribe } from "@/types/realtime";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";

export type ChallengeRoomChatMessage = {
  id: string;
  challengeId: string;
  senderId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  createdAtMs: number;
};

type SendRoomMessageInput = {
  challengeId: string;
  senderId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
};

const ROOM_MESSAGE_LIMIT = 80;

const normalizeUsername = (value: string | undefined) =>
  (value || "dareuser").replace(/^@/, "").trim().slice(0, 40) || "dareuser";

const normalizeDisplayName = (displayName: string | undefined, username: string) =>
  (displayName || username || "Dare User").trim().slice(0, 80) || "Dare User";

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string") return new Date(value).getTime() || null;
  return null;
};

const normalizeMessage = (
  id: string,
  data: any,
): ChallengeRoomChatMessage | null => {
  const content = String(data?.content || "").trim();
  const senderId = String(data?.sender_id || "");
  const challengeId = String(data?.challenge_id || "");
  if (!content || !senderId || !challengeId) return null;

  const username = normalizeUsername(data?.username);
  const displayName = normalizeDisplayName(data?.display_name, username);

  return {
    id,
    challengeId,
    senderId,
    username,
    displayName,
    avatarUrl: String(data?.avatar_url || ""),
    content: content.slice(0, 700),
    createdAtMs:
      toMillis(data?.client_created_at) || toMillis(data?.created_at) || Date.now(),
  };
};

class ChallengeRoomChatService {
  subscribeToMessages(
    challengeId: string | undefined,
    callback: (messages: ChallengeRoomChatMessage[]) => void,
    onError?: (message: string) => void,
  ): Unsubscribe {
    if (!challengeId) {
      callback([]);
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let active = true;
    const rows = new Map<string, ChallengeRoomChatMessage>();
    const emit = () => callback([...rows.values()].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id)));
    const load = async () => {
      const { data, error } = await client.from("community_challenge_room_messages").select("id,challenge_id,sender_id,username,display_name,avatar_url,content,client_created_at,created_at").eq("challenge_id", challengeId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(ROOM_MESSAGE_LIMIT);
      if (!active) return;
      if (error) { callback([]); onError?.("Room chat is unavailable right now."); return; }
      rows.clear();
      for (const message of data ?? []) {
        const normalized = normalizeMessage(message.id, message);
        if (normalized) rows.set(normalized.id, normalized);
      }
      emit();
      onError?.("");
    };
    void load();
    const refresh = scheduleRefresh(() => { void load(); });
    const apply = (payload: any) => {
      const id = String(payload?.new?.id || payload?.old?.id || "");
      if (!id) { refresh.schedule(); return; }
      if (payload.eventType === "DELETE") rows.delete(id);
      else {
        const normalized = normalizeMessage(id, payload.new);
        if (!normalized) { refresh.schedule(); return; }
        rows.set(id, normalized);
        const bounded = [...rows.values()].sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id)).slice(0, ROOM_MESSAGE_LIMIT);
        rows.clear(); for (const message of bounded) rows.set(message.id, message);
      }
      emit();
    };
    const channel = client.channel(`community-room-chat:${challengeId}`).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_room_messages", filter: `challenge_id=eq.${challengeId}` }, apply).subscribe();
    return () => { active = false; refresh.cancel(); void client.removeChannel(channel); };
  }

  async sendMessage(input: SendRoomMessageInput) {
    const content = input.content.trim();
    if (!input.challengeId || !input.senderId) {
      return { success: false, error: "You must be signed in to chat." };
    }
    if (!content) {
      return { success: false, error: "Write a message first." };
    }
    if (content.length > 700) {
      return { success: false, error: "Keep room messages under 700 characters." };
    }

    try {
      const username = normalizeUsername(input.username);
      const displayName = normalizeDisplayName(input.displayName, username);
      const { data, error } = await getSupabaseBrowserClient().from("community_challenge_room_messages").insert({
        challenge_id: input.challengeId,
        sender_id: input.senderId,
        username,
        display_name: displayName,
        avatar_url: input.avatarUrl || "",
        content,
        client_created_at: Date.now(),
        created_at: new Date().toISOString(),
      }).select("id,challenge_id,sender_id,username,display_name,avatar_url,content,client_created_at,created_at").single();
      if (error) throw error;
      const message = normalizeMessage(String(data.id), data);
      return message ? { success: true, message } : { success: false, error: "Could not read the sent message." };
    } catch (error) {
      console.warn("Failed to send community room message:", error);
      return { success: false, error: "Could not send message. Try again." };
    }
  }
}

export const challengeRoomChatService = new ChallengeRoomChatService();
