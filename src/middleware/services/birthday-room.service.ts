"use client";

import { apiFetch } from "@/lib/apiClient";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";

export type BirthdayDropType =
  | "wish"
  | "memory"
  | "photo"
  | "video"
  | "voice"
  | "dare"
  | "anonymous"
  | "confession"
  | "compliment"
  | "joke";

export type BirthdayRoomStatus = "active" | "archived" | "preview";

export type BirthdayReactionKey = "heart" | "laugh" | "cry" | "fire";

export type BirthdayPartyAction =
  | "idle"
  | "dance"
  | "dance_groove"
  | "dance_spin"
  | "dance_hype"
  | "dance_slide"
  | "dance_rave"
  | "wave"
  | "hug"
  | "confetti"
  | "cake"
  | "hearts"
  | "balloon"
  | "sit";

export type BirthdayPartyAccessory =
  | "hat"
  | "balloon"
  | "glasses"
  | "crown"
  | "glow"
  | "cake";

export type BirthdayPartyPresence = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  action: BirthdayPartyAction;
  accessory?: BirthdayPartyAccessory;
  isBirthdayUser: boolean;
  colorSeed: number;
  joinedAtMs: number;
  updatedAtMs: number;
  actionExpiresAtMs?: number;
};

export type BirthdayPartySnapshotType =
  | "energy"
  | "confetti"
  | "dance"
  | "cake"
  | "spotlight";

export type BirthdayPartySnapshot = {
  id: string;
  roomId: string;
  type: BirthdayPartySnapshotType;
  title: string;
  description: string;
  participantCount: number;
  energy: number;
  authorId: string;
  createdAtMs: number;
};

export type BirthdayRoom = {
  id: string;
  birthdayUserId: string;
  birthdayUsername: string;
  birthdayDisplayName: string;
  birthdayAvatarUrl: string;
  localDate: string;
  startsAtMs: number;
  endsAtMs: number;
  status: BirthdayRoomStatus;
  isBirthdayToday: boolean;
  isPreview: boolean;
  dropCount: number;
  participantCount: number;
};

export type BirthdayDrop = {
  id: string;
  roomId: string;
  birthdayUserId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  type: BirthdayDropType;
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  anonymous: boolean;
  sealed?: boolean;
  reactions: Record<BirthdayReactionKey, number>;
  reactionCount: number;
  replyCount: number;
  createdAtMs: number;
  dareStatus?: "sent" | "accepted" | "completed";
  proofMediaUrl?: string;
  proofMediaType?: "image" | "video" | "audio";
  clientOnly?: boolean;
};

export type BirthdayRoomWindow = {
  localDate: string;
  startsAtMs: number;
  endsAtMs: number;
  hasBirthday: boolean;
  isBirthdayToday: boolean;
};

type BirthdayUser = {
  id: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  birthdayMonth?: number;
  birthdayDay?: number;
  birthday_month?: number;
  birthday_day?: number;
  birthMonth?: number;
  birthDay?: number;
};

type PartyUser = {
  id: string;
  username?: string;
  displayName?: string;
  avatar?: string;
};

const EMPTY_REACTIONS: Record<BirthdayReactionKey, number> = {
  heart: 0,
  laugh: 0,
  cry: 0,
  fire: 0,
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getBirthdayParts = (user: BirthdayUser) => {
  const month =
    Number(user.birthdayMonth ?? user.birthday_month ?? user.birthMonth) || 0;
  const day =
    Number(user.birthdayDay ?? user.birthday_day ?? user.birthDay) || 0;

  return {
    month,
    day,
    hasBirthday: month >= 1 && month <= 12 && day >= 1 && day <= 31,
  };
};

const getWindowForDate = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    localDate: toLocalDateKey(start),
    startsAtMs: start.getTime(),
    endsAtMs: end.getTime(),
  };
};

export function getBirthdayRoomWindow(
  user: BirthdayUser,
  now = new Date(),
): BirthdayRoomWindow {
  const parts = getBirthdayParts(user);
  const window = getWindowForDate(now);
  const isBirthdayToday =
    parts.hasBirthday &&
    now.getMonth() + 1 === parts.month &&
    now.getDate() === parts.day;

  return {
    ...window,
    hasBirthday: parts.hasBirthday,
    isBirthdayToday,
  };
}

const toRoomId = (userId: string, localDate: string) =>
  `${userId}_${localDate}`.replace(/[^\w.-]/g, "_");

const cleanDropText = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);

const hasBlockedLanguage = (text: string) => {
  const normalized = text.toLowerCase();
  return [
    "kill yourself",
    "kys",
    "slut",
    "whore",
    "bitch",
    "nude",
    "dox",
  ].some((term) => normalized.includes(term));
};

const normalizeDrop = (id: string, data: any): BirthdayDrop => ({
  id,
  roomId: String(data.roomId || ""),
  birthdayUserId: String(data.birthdayUserId || ""),
  authorId: String(data.authorId || ""),
  authorUsername: String(data.authorUsername || "friend").replace(/^@/, ""),
  authorDisplayName: String(data.authorDisplayName || "Friend"),
  authorAvatarUrl: String(data.authorAvatarUrl || ""),
  type: (data.type || "wish") as BirthdayDropType,
  text: String(data.text || ""),
  mediaUrl: typeof data.mediaUrl === "string" ? data.mediaUrl : undefined,
  mediaType:
    data.mediaType === "video" || data.mediaType === "audio"
      ? data.mediaType
      : data.mediaType === "image"
        ? "image"
        : undefined,
  anonymous: data.anonymous === true,
  sealed: data.sealed === true,
  reactions: {
    ...EMPTY_REACTIONS,
    ...(data.reactions || {}),
  },
  reactionCount: Math.max(0, Number(data.reactionCount || 0)),
  replyCount: Math.max(0, Number(data.replyCount || 0)),
  createdAtMs:
    typeof data.createdAtMs === "number"
      ? data.createdAtMs
      : data.createdAt?.toMillis?.() || Date.now(),
  dareStatus:
    data.dareStatus === "accepted" || data.dareStatus === "completed"
      ? data.dareStatus
      : data.type === "dare"
        ? "sent"
        : undefined,
  proofMediaUrl:
    typeof data.proofMediaUrl === "string" ? data.proofMediaUrl : undefined,
  proofMediaType:
    data.proofMediaType === "video" || data.proofMediaType === "audio"
      ? data.proofMediaType
      : data.proofMediaType === "image"
        ? "image"
        : undefined,
});

const clampPartyPosition = (value: unknown, fallback: number) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.min(92, Math.max(8, nextValue));
};

const cleanRealtimePathPart = (value: string) =>
  value.replace(/[.#$/[\]]/g, "_").slice(0, 140);

const normalizePartyPresence = (
  userId: string,
  data: any,
): BirthdayPartyPresence => {
  const action = [
    "idle",
    "dance",
    "dance_groove",
    "dance_spin",
    "dance_hype",
    "dance_slide",
    "dance_rave",
    "wave",
    "hug",
    "confetti",
    "cake",
    "hearts",
    "balloon",
    "sit",
  ].includes(data?.action)
    ? data.action
    : "idle";

  const accessory = [
    "hat",
    "balloon",
    "glasses",
    "crown",
    "glow",
    "cake",
  ].includes(data?.accessory)
    ? data.accessory
    : undefined;

  return {
    userId,
    username: String(data?.username || "friend").replace(/^@/, "").slice(0, 50),
    displayName: String(data?.displayName || data?.username || "Friend").slice(
      0,
      80,
    ),
    avatarUrl: String(data?.avatarUrl || ""),
    x: clampPartyPosition(data?.x, 50),
    y: clampPartyPosition(data?.y, 58),
    targetX: clampPartyPosition(data?.targetX, 50),
    targetY: clampPartyPosition(data?.targetY, 58),
    action,
    accessory,
    isBirthdayUser: data?.isBirthdayUser === true,
    colorSeed: Math.max(0, Number(data?.colorSeed || 0)),
    joinedAtMs: Number(data?.joinedAtMs || Date.now()),
    updatedAtMs: Number(data?.updatedAtMs || Date.now()),
    actionExpiresAtMs:
      typeof data?.actionExpiresAtMs === "number"
        ? data.actionExpiresAtMs
        : undefined,
  };
};

const normalizePartySnapshot = (
  id: string,
  data: any,
): BirthdayPartySnapshot => ({
  id,
  roomId: String(data.roomId || ""),
  type: (data.type || "energy") as BirthdayPartySnapshotType,
  title: String(data.title || "Party moment"),
  description: String(data.description || ""),
  participantCount: Math.max(0, Number(data.participantCount || 0)),
  energy: Math.max(0, Math.min(100, Number(data.energy || 0))),
  authorId: String(data.authorId || ""),
  createdAtMs:
    typeof data.createdAtMs === "number"
      ? data.createdAtMs
      : data.createdAt?.toMillis?.() || Date.now(),
});

const isBirthdayPartyPermissionError = (error: unknown) => {
  const code = String((error as { code?: unknown })?.code || "").toLowerCase();
  const message = String(
    (error as { message?: unknown })?.message || "",
  ).toLowerCase();

  return (
    code.includes("permission") ||
    code.includes("denied") ||
    message.includes("permission_denied") ||
    message.includes("permission denied")
  );
};

const warnPartyPermissionOnce = (() => {
  let warned = false;
  return (context: string) => {
    if (warned) return;
    warned = true;
    console.warn(
      `Birthday Party Room realtime is running in preview mode until database rules allow ${context}.`,
    );
  };
})();

class BirthdayRoomService {
  private partyPresenceChannels = new Map<string, any>();
  private partyPresenceState = new Map<string, BirthdayPartyPresence>();
  buildRoomForUser(user: BirthdayUser, now = new Date()): BirthdayRoom {
    const roomWindow = getBirthdayRoomWindow(user, now);
    const isActive =
      now.getTime() >= roomWindow.startsAtMs &&
      now.getTime() < roomWindow.endsAtMs &&
      roomWindow.isBirthdayToday;
    const isPreview = !roomWindow.hasBirthday || !roomWindow.isBirthdayToday;

    return {
      id: toRoomId(user.id, roomWindow.localDate),
      birthdayUserId: user.id,
      birthdayUsername: (user.username || "birthday").replace(/^@/, ""),
      birthdayDisplayName: user.displayName || user.username || "Birthday Star",
      birthdayAvatarUrl: user.avatar || "",
      localDate: roomWindow.localDate,
      startsAtMs: roomWindow.startsAtMs,
      endsAtMs: roomWindow.endsAtMs,
      status: isActive ? "active" : isPreview ? "preview" : "archived",
      isBirthdayToday: roomWindow.isBirthdayToday,
      isPreview,
      dropCount: 0,
      participantCount: 0,
    };
  }

  async ensureRoom(room: BirthdayRoom): Promise<void> {
    if (room.status === "archived") return;

    await apiFetch("/api/birthday/rooms", {
      method: "POST",
      body: JSON.stringify(room),
    });
  }

  subscribeToDrops(
    roomId: string,
    callback: (drops: BirthdayDrop[]) => void,
    onError?: (error: Error) => void,
  ) {
    const client = getSupabaseBrowserClient(); let active = true; let degraded = false;
    const rows = new Map<string, BirthdayDrop>();
    const convert = (row: any) => normalizeDrop(row.id, { roomId: row.room_id, birthdayUserId: row.birthday_user_id, authorId: row.real_author_id, type: row.type, text: row.text, mediaUrl: row.media_url, mediaType: row.media_type, anonymous: row.anonymous, sealed: row.sealed, reactionCount: row.reaction_count, replyCount: row.reply_count, createdAtMs: Date.parse(row.created_at) });
    const emit = () => callback([...rows.values()].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id)).slice(-80));
    const load = async () => { const { data, error } = await client.from("birthday_drops").select("id,room_id,birthday_user_id,real_author_id,type,text,media_url,media_type,anonymous,sealed,reaction_count,reply_count,created_at").eq("room_id", roomId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(80); if (!active) return; if (error) { degraded = true; onError?.(error); return; } rows.clear(); for (const row of data ?? []) { const item = convert(row); if (item) rows.set(String(item.id), item); } degraded = false; emit(); };
    const refresh = scheduleRefresh(() => { if (degraded) void load(); });
    void load(); const apply = (payload: any) => { const id = String(payload?.new?.id || payload?.old?.id || ""); if (!id) { degraded = true; refresh.schedule(); return; } if (payload.eventType === "DELETE") rows.delete(id); else { const item = convert(payload.new); if (!item) { degraded = true; refresh.schedule(); return; } rows.set(id, item); } emit(); };
    const channel = client.channel(`birthday-drops:${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "birthday_drops", filter: `room_id=eq.${roomId}` }, apply).subscribe((status) => { degraded = status !== "SUBSCRIBED"; if (degraded) refresh.schedule(); }); return () => { active = false; refresh.cancel(); void client.removeChannel(channel); };
  }

  async addDrop(
    room: BirthdayRoom,
    input: {
      authorId: string;
      authorUsername: string;
      authorDisplayName: string;
      authorAvatarUrl: string;
      type: BirthdayDropType;
      text: string;
      anonymous: boolean;
      sealed?: boolean;
      mediaUrl?: string;
      mediaType?: "image" | "video" | "audio";
    },
  ): Promise<{ success: boolean; drop?: BirthdayDrop; error?: string }> {
    const text = cleanDropText(input.text);
    if (!text && !input.mediaUrl) {
      return { success: false, error: "Write something or add media first." };
    }
    if (hasBlockedLanguage(text)) {
      return {
        success: false,
        error: "That message needs a softer edit before it can be dropped.",
      };
    }

    const result = await apiFetch<{ ok: boolean; drop: Record<string, unknown> }>(
      `/api/birthday/rooms/${encodeURIComponent(room.id)}/drops`,
      {
        method: "POST",
        body: JSON.stringify({
          type: input.type,
          text,
          anonymous: input.anonymous,
          sealed: input.sealed === true,
          mediaUrl: input.mediaUrl,
          mediaType: input.mediaType,
        }),
      },
    );

    if (!result?.drop || typeof result.drop.id !== "string") {
      return { success: false, error: "Could not create birthday drop." };
    }

    return {
      success: true,
      drop: normalizeDrop(result.drop.id, result.drop),
    };
  }

  async reactToDrop(
    dropId: string,
    roomId: string,
    reaction: BirthdayReactionKey,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiFetch(`/api/birthday/drops/${encodeURIComponent(dropId)}/react`, {
        method: "POST",
        body: JSON.stringify({ roomId, reaction }),
      });
      return { success: true };
    } catch (error) {
      console.warn("Birthday drop reaction failed:", error);
      return { success: false, error: "Could not react right now." };
    }
  }

  async commentOnDrop(
    dropId: string,
    roomId: string,
    text: string,
  ): Promise<{ success: boolean; error?: string }> {
    const cleanComment = cleanDropText(text).slice(0, 360);
    if (!cleanComment) {
      return { success: false, error: "Write a comment first." };
    }
    if (hasBlockedLanguage(cleanComment)) {
      return {
        success: false,
        error: "That comment needs a softer edit before it can be posted.",
      };
    }

    try {
      await apiFetch(`/api/birthday/drops/${encodeURIComponent(dropId)}/comment`, {
        method: "POST",
        body: JSON.stringify({ roomId, text: cleanComment }),
      });
      return { success: true };
    } catch (error) {
      console.warn("Birthday drop comment failed:", error);
      return { success: false, error: "Could not comment right now." };
    }
  }

  async acceptBirthdayDare(
    dropId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiFetch(`/api/birthday/drops/${encodeURIComponent(dropId)}/dare`, {
        method: "PATCH",
        body: JSON.stringify({ action: "accept" }),
      });
      return { success: true };
    } catch (error) {
      console.warn("Birthday dare accept failed:", error);
      return { success: false, error: "Could not accept this birthday dare." };
    }
  }

  async completeBirthdayDare(
    dropId: string,
    proof: { mediaUrl: string; mediaType: "image" | "video" | "audio" },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiFetch(`/api/birthday/drops/${encodeURIComponent(dropId)}/dare`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "complete",
          proofMediaUrl: proof.mediaUrl,
          proofMediaType: proof.mediaType,
        }),
      });
      return { success: true };
    } catch (error) {
      console.warn("Birthday dare completion failed:", error);
      return { success: false, error: "Could not complete this birthday dare." };
    }
  }

  async joinPartyRoom(room: BirthdayRoom, user: PartyUser): Promise<() => void> {
    if (room.status === "archived") {
      return () => undefined;
    }

    const roomId = cleanRealtimePathPart(room.id);
    const userId = cleanRealtimePathPart(user.id);
    const channelKey = `${roomId}:${userId}`;
    const joinedAtMs = Date.now();
    const x = 18 + Math.round(Math.random() * 64);
    const y = 24 + Math.round(Math.random() * 58);
    const basePresence: BirthdayPartyPresence = {
      userId: user.id,
      username: (user.username || "friend").replace(/^@/, ""),
      displayName: user.displayName || user.username || "Friend",
      avatarUrl: user.avatar || "",
      x,
      y,
      targetX: x,
      targetY: y,
      action: "idle",
      accessory: room.birthdayUserId === user.id ? "crown" : "hat",
      isBirthdayUser: room.birthdayUserId === user.id,
      colorSeed: Math.abs(
        user.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0),
      ),
      joinedAtMs,
      updatedAtMs: joinedAtMs,
    };

    const client = getSupabaseBrowserClient();
    const channel = client.channel(`birthday-room:${roomId}`, {
      config: { private: true, presence: { key: userId } },
    });
    this.partyPresenceChannels.set(channelKey, channel);
    this.partyPresenceState.set(channelKey, basePresence);
    await new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.track(basePresence);
            resolve();
          } catch (error) {
            reject(error);
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Birthday presence subscription ${status.toLowerCase()}`));
        }
      });
    }).catch(async (error) => {
      this.partyPresenceChannels.delete(channelKey);
      this.partyPresenceState.delete(channelKey);
      await client.removeChannel(channel);
      throw error;
    });

    return () => {
      this.partyPresenceChannels.delete(channelKey);
      this.partyPresenceState.delete(channelKey);
      void channel.untrack().finally(() => client.removeChannel(channel));
    };
  }

  subscribeToPartyPresence(
    roomId: string,
    callback: (presence: BirthdayPartyPresence[]) => void,
    onError?: (error: Error) => void,
  ) {
    const roomKey = cleanRealtimePathPart(roomId);
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`birthday-room:${roomKey}`, {
      config: { private: true },
    });
    const publish = () => {
      const now = Date.now();
      const guests = Object.values(channel.presenceState() as Record<string, any[]>).flatMap(
        (entries) => entries.map((entry) => normalizePartyPresence(String(entry.userId || ""), entry)),
      );
      callback(
        guests
          .filter((guest) => now - guest.updatedAtMs < 90_000)
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
          .slice(0, 36),
      );
    };
    channel.on("presence", { event: "sync" }, publish);
    channel.subscribe((status: string) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(new Error(`Birthday presence subscription ${status.toLowerCase()}`));
      }
    });

    return () => {
      void client.removeChannel(channel);
    };
  }

  async updatePartyPresence(
    roomId: string,
    userId: string,
    patch: Partial<
      Pick<
        BirthdayPartyPresence,
        | "x"
        | "y"
        | "targetX"
        | "targetY"
        | "action"
        | "accessory"
      >
    > & { actionExpiresAtMs?: number | null },
  ): Promise<void> {
    const roomKey = cleanRealtimePathPart(roomId);
    const userKey = cleanRealtimePathPart(userId);
    const channelKey = `${roomKey}:${userKey}`;
    const channel = this.partyPresenceChannels.get(channelKey);
    const current = this.partyPresenceState.get(channelKey);
    if (!channel || !current) return;
    const next: BirthdayPartyPresence = {
      ...current,
      ...patch,
      actionExpiresAtMs: patch.actionExpiresAtMs ?? current.actionExpiresAtMs,
      updatedAtMs: Date.now(),
    };
    this.partyPresenceState.set(channelKey, next);
    await channel.track(next);
  }

  subscribeToPartySnapshots(
    roomId: string,
    callback: (snapshots: BirthdayPartySnapshot[]) => void,
    onError?: (error: Error) => void,
  ) {
    const client = getSupabaseBrowserClient(); let active = true; let degraded = false;
    const rows = new Map<string, BirthdayPartySnapshot>();
    const convert = (row: any) => normalizePartySnapshot(row.id, { roomId: row.room_id, birthdayUserId: row.birthday_user_id, authorId: row.author_id, type: row.type, title: row.title, description: row.description, participantCount: row.participant_count, energy: row.energy, createdAt: row.created_at });
    const emit = () => callback([...rows.values()].sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id)).slice(0, 12));
    const load = async () => { const { data, error } = await client.from("birthday_party_snapshots").select("id,room_id,birthday_user_id,author_id,type,title,description,participant_count,energy,created_at").eq("room_id", roomId).order("created_at", { ascending: false }).limit(12); if (!active) return; if (error) { degraded = true; onError?.(error); return; } rows.clear(); for (const row of data ?? []) { const item = convert(row); if (item) rows.set(String(item.id), item); } degraded = false; emit(); };
    const refresh = scheduleRefresh(() => { if (degraded) void load(); });
    void load(); const apply = (payload: any) => { const id = String(payload?.new?.id || payload?.old?.id || ""); if (!id) { degraded = true; refresh.schedule(); return; } if (payload.eventType === "DELETE") rows.delete(id); else { const item = convert(payload.new); if (!item) { degraded = true; refresh.schedule(); return; } rows.set(id, item); } emit(); };
    const channel = client.channel(`birthday-snapshots:${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "birthday_party_snapshots", filter: `room_id=eq.${roomId}` }, apply).subscribe((status) => { degraded = status !== "SUBSCRIBED"; if (degraded) refresh.schedule(); }); return () => { active = false; refresh.cancel(); void client.removeChannel(channel); };
  }

  async recordPartySnapshot(
    room: BirthdayRoom,
    input: {
      authorId: string;
      type: BirthdayPartySnapshotType;
      title: string;
      description: string;
      participantCount: number;
      energy: number;
    },
  ): Promise<void> {
    if (room.status === "archived") return;

    try {
      const createdAtMs = Date.now();
      const { error } = await getSupabaseBrowserClient().from("birthday_party_snapshots").insert({
        room_id: room.id,
        birthday_user_id: room.birthdayUserId,
        author_id: input.authorId,
        type: input.type,
        title: input.title.slice(0, 120),
        description: input.description.slice(0, 240),
        participant_count: Math.max(0, input.participantCount),
        energy: Math.max(0, Math.min(100, input.energy)),
        created_at: new Date(createdAtMs).toISOString(),
      });
      if (error) throw error;
    } catch (error) {
      if (isBirthdayPartyPermissionError(error)) {
        warnPartyPermissionOnce("birthday_party_snapshots");
        return;
      }

      console.warn("Birthday Party Room snapshot save failed.");
    }
  }
}

export const birthdayRoomService = new BirthdayRoomService();
