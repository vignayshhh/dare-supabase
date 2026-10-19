import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type Circle = {
  id: string;
  chatEpoch: string;
  ownerId: string;
  name: string;
  avatar: string;
  invitePermission: "owner" | "members";
  createdAt: string;
  members: { id: string; name: string; avatar: string }[];
};
export type CircleInvitation = {
  id: string;
  code: string;
  token: string;
  expiresAt: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
};
export type CircleInvitePreview = {
  circleId: string;
  name: string;
  avatar: string;
  inviter: string;
  memberCount: number;
  alreadyMember: boolean;
  expiresAt: string;
};
export type CircleEvent = {
  id: string;
  name: string;
  description: string;
  startsAt: string | null;
  completedAt: string | null;
  creatorId: string;
};
export type CircleMemory = {
  sourceTable?: "dares" | "truths" | "drama_posts" | "circle_jail_cases";
  id: string;
  title: string;
  kind: string;
  createdAt: string;
  mediaUrl?: string;
};
export type CircleEventMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export class CircleRepository {
  async eventMessages(eventId: string): Promise<CircleEventMessage[]> {
    const conversationId = await this.rpc<string>(
      "get_circle_event_conversation",
      { p_event: eventId },
    );
    const { data, error } = await getSupabaseBrowserClient()
      .from("messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .reverse()
      .map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        body: m.body,
        createdAt: m.created_at,
      }));
  }
  async sendEventMessage(eventId: string, body: string) {
    if (!body.trim() || body.length > 2000)
      throw new Error("Write a message up to 2,000 characters.");
    const conversationId = await this.rpc<string>(
      "get_circle_event_conversation",
      { p_event: eventId },
    );
    await this.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: body.trim(),
      p_media_bucket: null,
      p_media_path: null,
      p_reply_to_id: null,
    });
  }
  async aura(circleId: string, userId: string): Promise<number> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("circle_aura")
      .select("current_aura")
      .eq("circle_id", circleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.current_aura ?? 100;
  }
  async memberIds(circleId: string): Promise<string[]> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("circle_members")
      .select("user_id")
      .eq("circle_id", circleId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((m) => m.user_id);
  }
  async events(circleId: string): Promise<CircleEvent[]> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("circle_events")
      .select("*")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      startsAt: r.starts_at,
      completedAt: r.completed_at,
      creatorId: r.creator_id,
    }));
  }
  async createEvent(
    circleId: string,
    creatorId: string,
    name: string,
    startsAt: string | null,
  ) {
    const { error } = await getSupabaseBrowserClient()
      .from("circle_events")
      .insert({
        circle_id: circleId,
        creator_id: creatorId,
        name: name.trim(),
        starts_at: startsAt,
      });
    if (error) throw new Error(error.message);
  }
  async completeEvent(id: string) {
    const { error } = await getSupabaseBrowserClient()
      .from("circle_events")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
  async memories(circleId: string, eventId?: string): Promise<CircleMemory[]> {
    const db = getSupabaseBrowserClient();
    let posts = db
      .from("posts")
      .select("id,body,metadata,created_at")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: false })
      .limit(100);
    let dares = db
      .from("dares")
      .select("id,title,body,created_at")
      .eq("circle_id", circleId)
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false })
      .limit(100);
    let drama = db
      .from("drama_posts")
      .select("id,kind,payload,created_at")
      .eq("circle_id", circleId)
      .not("resolved_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (eventId) {
      posts = posts.eq("event_id", eventId);
      dares = dares.eq("event_id", eventId);
      drama = drama.eq("event_id", eventId);
    }
    let truths = db.from("truths").select("id,question,created_at").eq("circle_id",circleId).eq("status","ANSWERED").order("created_at",{ascending:false}).limit(100);
    if (eventId) truths = truths.eq("event_id",eventId);
    const jail = eventId ? Promise.resolve({data:[],error:null}) : db.from("circle_jail_cases").select("id,reason,created_at,status").eq("circle_id",circleId).neq("status","open").order("created_at",{ascending:false}).limit(100);
    const results = await Promise.all([posts, dares, drama, truths, jail]);
    for (const r of results) if (r.error) throw new Error(r.error.message);
    return [
      ...(results[0].data ?? []).map((r: any) => ({
        id: r.id,
        title: r.body,
        kind: "post",
        createdAt: r.created_at,
        mediaUrl: r.metadata?.media_url,
      })),
      ...(results[1].data ?? []).map((r: any) => ({
        id: r.id,
        title: r.body || r.title,
        kind: "completed dare",
        sourceTable: "dares" as const,
        createdAt: r.created_at,
      })),
      ...(results[2].data ?? []).map((r: any) => ({
        id: r.id,
        title:
          r.payload?.text || r.payload?.event || r.payload?.promise ||
          r.payload?.title ||
          r.payload?.question ||
          r.payload?.statement ||
          "A story to remember",
        kind: r.kind,
        sourceTable: "drama_posts" as const,
        createdAt: r.created_at,
      })),
      ...(results[3].data ?? []).map((r: any) => ({ id:r.id,title:r.question,kind:"answered truth",createdAt:r.created_at,sourceTable:"truths" as const })),
      ...(results[4].data ?? []).map((r: any) => ({ id:r.id,title:r.reason,kind:`Jail ? ${r.status}`,createdAt:r.created_at,sourceTable:"circle_jail_cases" as const })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async list(): Promise<Circle[]> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("circles")
      .select(
        "id,chat_epoch,owner_id,name,avatar,invite_permission,created_at,circle_members(user_id,profiles!circle_members_user_id_fkey(display_name,username,avatar_url))",
      )
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      chatEpoch: row.chat_epoch,
      ownerId: row.owner_id,
      name: row.name,
      avatar: row.avatar,
      invitePermission: row.invite_permission,
      createdAt: row.created_at,
      members: (row.circle_members ?? []).map((m: any) => ({
        id: m.user_id,
        name: m.profiles?.display_name || m.profiles?.username || "Friend",
        avatar: m.profiles?.avatar_url || "",
      })),
    }));
  }
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  create(name: string, avatar: string) {
    return this.rpc<string>("create_circle", {
      p_name: name,
      p_avatar: avatar,
    });
  }
  manage(id: string, action: string, value?: string) {
    return this.rpc<void>("manage_circle", {
      p_circle: id,
      p_action: action,
      p_value: value ?? null,
    });
  }
  async invite(id: string): Promise<CircleInvitation> {
    const row = await this.rpc<any>("create_circle_invitation", {
      p_circle: id,
    });
    return this.mapInvite(Array.isArray(row) ? row[0] : row);
  }
  async invitations(id: string): Promise<CircleInvitation[]> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("circle_invitations")
      .select("*")
      .eq("circle_id", id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(this.mapInvite);
  }
  private mapInvite(row: any): CircleInvitation {
    return {
      id: row.id,
      code: row.code,
      token: row.token,
      expiresAt: row.expires_at,
      uses: row.uses,
      maxUses: row.max_uses,
      revoked: !!row.revoked_at,
    };
  }
}
