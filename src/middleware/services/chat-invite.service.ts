import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Unsubscribe } from "@/types/realtime";
import { resolveUserProfile } from "@/utils/profileResolver";

const CHAT_INVITE_COLUMNS = "id,legacy_key,conversation_id,sender_id,recipient_id,inviter_name,invitee_name,original_participant_ids,status,created_at,updated_at,joined_at,entered_at,ended_at";

export type ChatInviteStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "removed"
  | "left";

export interface ChatInvite {
  id: string;
  conversation_id: string;
  inviter_id: string;
  inviter_name: string;
  invitee_id: string;
  invitee_name: string;
  original_participant_ids: string[];
  status: ChatInviteStatus;
  created_at: string;
  updated_at: string;
  joined_at?: string | null;
  entered_at?: string | null;
  ended_at?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inviteDocId(conversationId: string, inviteeId: string): string {
  return `${conversationId}_${inviteeId}`;
}

async function findInvite(client: ReturnType<typeof getSupabaseBrowserClient>, inviteId: string) {
  const byLegacy = await client.from("chat_invites").select(CHAT_INVITE_COLUMNS).eq("legacy_key", inviteId).maybeSingle();
  if (byLegacy.data || byLegacy.error || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteId)) return byLegacy.data;
  const { data } = await client.from("chat_invites").select(CHAT_INVITE_COLUMNS).eq("id", inviteId).maybeSingle();
  return data;
}

async function createInviteEvent(
  conversationId: string,
  userId: string,
  action: "invited" | "joined" | "removed" | "left",
  participant: { userId: string; name: string },
  participants: string[],
): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from("message_events").insert({
    conversation_id: conversationId,
    actor_id: userId,
    event_type: "invite",
    payload: {
      action,
      user_id: participant.userId,
      user_name: participant.name,
      participants: [...new Set(participants)],
    },
  });
  if (error) throw error;
}

class ChatInviteService {
  subscribeReceivedInvites(
    userId: string,
    callback: (invites: ChatInvite[]) => void,
  ): Unsubscribe {
    const client = getSupabaseBrowserClient(); let disposed = false; const rows = new Map<string, ChatInvite>();
    const emit = () => callback([...rows.values()].sort((a,b) => Date.parse(b.updated_at)-Date.parse(a.updated_at) || b.id.localeCompare(a.id)).slice(0,100));
    const apply = (row: any) => { const invite=this.mapInvite(row); rows.set(String(row.id),invite); };
    const load = async () => { const { data, error } = await client.from("chat_invites").select(CHAT_INVITE_COLUMNS).eq("recipient_id", userId).order("updated_at", { ascending: false }).order("id",{ascending:false}).limit(100); if (!disposed) { if(error){callback([]);return;} for(const row of data??[])apply(row); emit(); } };
    void load();
    const channel = client.channel(`chat-invites:${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_invites", filter: `recipient_id=eq.${userId}` }, (payload) => { if(disposed)return; const id=String((payload.old as any)?.id||""); if(payload.eventType==="DELETE")rows.delete(id);else apply(payload.new);emit(); }).subscribe();
    return () => { disposed = true; void client.removeChannel(channel); };
  }

  private mapInvite(row: any): ChatInvite { return { id: row.legacy_key || row.id, conversation_id: row.conversation_id, inviter_id: row.sender_id, inviter_name: row.inviter_name || "", invitee_id: row.recipient_id, invitee_name: row.invitee_name || "", original_participant_ids: Array.isArray(row.original_participant_ids) ? row.original_participant_ids : [], status: String(row.status || "PENDING").toLowerCase() as ChatInviteStatus, created_at: row.created_at, updated_at: row.updated_at || row.created_at, joined_at: row.joined_at, entered_at: row.entered_at, ended_at: row.ended_at }; }

  subscribeConversationInvites(
    conversationId: string,
    userId: string,
    isOriginalParticipant: boolean,
    inviteeIds: string[],
    callback: (invites: ChatInvite[]) => void,
  ): Unsubscribe {
    const targetInviteeIds = isOriginalParticipant ? inviteeIds : [userId];
    const uniqueInviteeIds = [...new Set(targetInviteeIds.filter(Boolean))];
    const isOriginalScope = isOriginalParticipant;

    if (!isOriginalScope && uniqueInviteeIds.length === 0) {
      callback([]);
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let disposed = false; const rows = new Map<string, ChatInvite>();
    const emit = () => callback([...rows.values()].filter((invite)=>isOriginalScope || uniqueInviteeIds.includes(invite.invitee_id)).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||b.id.localeCompare(a.id)));
    const apply = (row:any)=>{const invite=this.mapInvite(row);rows.set(String(row.id),invite);};
    const load = async () => { let query = client.from("chat_invites").select(CHAT_INVITE_COLUMNS).eq("conversation_id", conversationId); if (!isOriginalScope) query = query.in("recipient_id", uniqueInviteeIds); const { data, error } = await query.order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(100); if (!disposed) {if(error){callback([]);return;}for(const row of data??[])apply(row);emit();} };
    void load();
    const channel = client.channel(`chat-invites-conversation:${conversationId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_invites", filter: `conversation_id=eq.${conversationId}` }, (payload)=>{if(disposed)return;const id=String((payload.old as any)?.id||"");if(payload.eventType==="DELETE")rows.delete(id);else apply(payload.new);emit();}).subscribe();
    return () => { disposed = true; void client.removeChannel(channel); };
  }

  async sendInvite(request: {
    conversationId: string;
    inviterId: string;
    inviterName: string;
    inviteeId: string;
    inviteeName: string;
  }): Promise<void> {
    const client = getSupabaseBrowserClient();
    const { data: members, error: membersError } = await client.from("conversation_members").select("user_id,role").eq("conversation_id", request.conversationId);
    if (membersError) throw membersError;
    const originalParticipantIds = (members ?? []).map((member) => member.user_id as string);
    if (!originalParticipantIds.includes(request.inviterId)) {
      throw new Error("Only the original chat members can invite friends");
    }
    if (originalParticipantIds.includes(request.inviteeId)) {
      throw new Error("That user is already in this conversation");
    }

    const id = inviteDocId(request.conversationId, request.inviteeId);
    const { data: existing } = await client.from("chat_invites").select("id,status").eq("legacy_key", id).maybeSingle();
    const existingStatus = String(existing?.status || "").toLowerCase();
    if (existingStatus === "pending" || existingStatus === "accepted") {
      throw new Error("This friend already has an active invite");
    }

    const timestamp = nowIso();
    const payload = { conversation_id: request.conversationId, sender_id: request.inviterId, recipient_id: request.inviteeId, inviter_name: request.inviterName, invitee_name: request.inviteeName, original_participant_ids: originalParticipantIds, status: "PENDING", updated_at: timestamp, joined_at: null, entered_at: null, ended_at: null };
    const { error } = existing?.id
      ? await client.from("chat_invites").update(payload).eq("id", existing.id)
      : await client.from("chat_invites").insert({ legacy_key: id, ...payload, created_at: timestamp });
    if (error) throw error;

    await createInviteEvent(
      request.conversationId,
      request.inviterId,
      "invited",
      { userId: request.inviteeId, name: request.inviteeName },
      originalParticipantIds,
    );
  }

  async acceptInvite(inviteId: string, userId: string): Promise<ChatInvite> {
    const client = getSupabaseBrowserClient();
    const rawInvite = await findInvite(client, inviteId);
    if (!rawInvite) throw new Error("Invite not found");
    const invite = this.mapInvite(rawInvite);
    if (invite.invitee_id !== userId) {
      throw new Error("You can only accept invites sent to you");
    }
    if (invite.status !== "pending") {
      throw new Error("This invite is no longer pending");
    }

    const { data, error } = await (client as any).rpc("accept_chat_invite", { p_invite_id: inviteId });
    if (error || !data) throw error || new Error("Invite acceptance failed");
    return this.mapInvite(data);
  }

  async markInviteEntered(inviteId: string, userId: string): Promise<void> {
    const { data: rawInvite, error } = await (getSupabaseBrowserClient() as any).rpc("mark_chat_invite_entered_native", { p_invite_id: inviteId, p_user_id: userId });
    if (error) throw error;
    const inviteForEvent = rawInvite ? ({ id: inviteId, ...rawInvite } as ChatInvite) : null;
    if (!inviteForEvent) return;

    await createInviteEvent(
      inviteForEvent.conversation_id,
      userId,
      "joined",
      { userId, name: inviteForEvent.invitee_name || "Someone" },
      [...inviteForEvent.original_participant_ids, userId],
    );
  }

  async rejectInvite(inviteId: string, userId: string): Promise<void> {
    const client = getSupabaseBrowserClient();
    const rawInvite = await findInvite(client, inviteId);
    if (!rawInvite) throw new Error("Invite not found");
    const invite = this.mapInvite(rawInvite);
    if (invite.invitee_id !== userId) {
      throw new Error("You can only reject invites sent to you");
    }

    const { error } = await client.from("chat_invites").update({ status: "DECLINED", ended_at: nowIso(), updated_at: nowIso() }).eq("id", rawInvite.id);
    if (error) throw error;
  }

  async endTemporaryAccess(request: {
    inviteId: string;
    actorId: string;
    action: "removed" | "left";
  }): Promise<void> {
    const client = getSupabaseBrowserClient();
    const rawInvite = await findInvite(client, request.inviteId);
    if (!rawInvite) throw new Error("Invite not found");
    const invite = this.mapInvite(rawInvite);
    const isOriginal = invite.original_participant_ids.includes(request.actorId);
    const isInvitee = invite.invitee_id === request.actorId;

    if (request.action === "left" && !isInvitee) {
      throw new Error("Only the invited friend can leave");
    }
    if (request.action === "removed" && !isOriginal) {
      throw new Error("Only original chat members can remove guests");
    }
    if (invite.status !== "accepted") {
      return;
    }

    await createInviteEvent(
      invite.conversation_id,
      request.actorId,
      request.action,
      { userId: invite.invitee_id, name: invite.invitee_name || "Someone" },
      [...invite.original_participant_ids, invite.invitee_id],
    );

    const { error } = await (client as any).rpc("end_chat_invite_access", { p_invite_id: request.inviteId, p_action: request.action });
    if (error) throw error;
  }

  async getConversationForUser(conversationId: string, userId: string) {
    const client = getSupabaseBrowserClient();
    const { data: membership, error: membershipError } = await client.from("conversation_members").select("user_id,role,joined_at").eq("conversation_id", conversationId);
    if (membershipError) throw membershipError;
    const participantIds = (membership ?? []).map((member) => member.user_id as string);
    if (!participantIds.includes(userId)) return null;
    const { data, error } = await client.from("conversations").select("id,created_at,updated_at,last_message_at,title").eq("id", conversationId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: inviteRow } = await client
      .from("chat_invites")
      .select("original_participant_ids")
      .eq("conversation_id", conversationId)
      .eq("recipient_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const originalParticipantIds = Array.isArray(inviteRow?.original_participant_ids)
      ? inviteRow.original_participant_ids as string[]
      : participantIds.filter((id) => id !== userId);
    const temporaryParticipantIds: string[] = [userId];

    const otherOriginalIds = originalParticipantIds.filter((id) => id !== userId);
    const profiles = await Promise.all(
      otherOriginalIds.map((id) => resolveUserProfile(id)),
    );
    const names = profiles.map((profile, index) => {
      const fallbackId = otherOriginalIds[index];
      return (
        profile?.displayName ||
        profile?.display_name ||
        profile?.username ||
        `user_${fallbackId.slice(-6)}`
      );
    });

    return {
      id: data.id,
      user1_id: originalParticipantIds[0],
      user2_id: originalParticipantIds[1],
      temporary_participant_ids: temporaryParticipantIds,
      created_at: data.created_at || "",
      updated_at: data.updated_at || "",
      last_message_at: data.last_message_at || "",
      last_message_content: "",
      last_seen_by_user: {},
      last_seen_message_id_by_user: {},
      cleared_at: null,
      unread_count: 0,
      is_online: false,
      is_typing: false,
      other_user: {
        id: "",
        user_id: "",
        username: "temporary_chat",
        display_name: names.length > 0 ? names.join(" and ") : "Temporary chat",
        avatar_url: null,
      },
    };
  }
}

export const chatInviteService = new ChatInviteService();
