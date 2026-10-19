import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Unsubscribe } from "@/types/realtime";

export type RelationshipType = "conflict" | "alliance" | "favorite" | "rival";
export type RelationshipStatus = "unacknowledged" | "mutual" | "countered" | "resolved";
export interface RelationshipPersonSnapshot { id: string; display_name: string; username: string; avatar_url: string; }
export interface RelationshipRecord { id: string; owner_id: string; target_id: string; type: RelationshipType; reason: string; target_reason?: string | null; status: RelationshipStatus; owner_snapshot: RelationshipPersonSnapshot; target_snapshot: RelationshipPersonSnapshot; month_key?: string | null; watchers_count: number; resolved_by?: Record<string, boolean>; created_at: string; updated_at: string; resolved_at?: string | null; }
export interface CreateRelationshipInput { owner: RelationshipPersonSnapshot; target: RelationshipPersonSnapshot; type: RelationshipType; reason: string; }
const monthKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };
const RELATIONSHIP_COLUMNS = "id,owner_id,target_id,type,reason,target_reason,status,owner_snapshot,target_snapshot,month_key,watchers_count,resolved_by,created_at,updated_at,resolved_at";

class RelationshipsService {
  subscribeForProfile(profileUserId: string, onNext: (records: RelationshipRecord[]) => void, onError?: (error: Error) => void): Unsubscribe {
    const client = getSupabaseBrowserClient(); let disposed = false; const records = new Map<string, RelationshipRecord>();
    const emit = () => onNext([...records.values()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id)).slice(0,100));
    const load = async () => {
      const { data, error } = await client.from("relationships").select(RELATIONSHIP_COLUMNS).or(`owner_id.eq.${profileUserId},target_id.eq.${profileUserId}`).order("created_at", { ascending: false }).order("id",{ascending:false}).limit(100);
      if (disposed) return; if (error) { onError?.(error); return; } for(const row of data??[])records.set(row.id,row as RelationshipRecord);emit();
    };
    void load();
    const channel = client.channel(`relationship-profile:${profileUserId}`, { config: { private: true } }).on("broadcast", { event: "relationship_changed" }, ({payload}) => { if(disposed)return; const message=payload as {operation?:string;record?:RelationshipRecord}; const row=message.record; if(!row||!row.id)return; if(message.operation==="DELETE") records.delete(row.id); else records.set(row.id,row); emit(); }).subscribe();
    return () => { disposed = true; void client.removeChannel(channel); };
  }

  async createRelationship(input: CreateRelationshipInput): Promise<string> {
    const { data, error } = await getSupabaseBrowserClient().rpc("create_relationship_with_alert", { p_target_id: input.target.id, p_type: input.type, p_reason: input.reason, p_month_key: input.type === "favorite" ? monthKey() : null });
    if (error || !data) throw error ?? new Error("relationship_create_failed");
    return String((data as { id: string }).id);
  }

  async acceptConflict(relationshipId: string): Promise<void> { const { error } = await getSupabaseBrowserClient().rpc("respond_to_relationship_conflict", { p_relationship_id: relationshipId, p_response: "accept", p_reason: null }); if (error) throw error; }
  async counterConflict(relationshipId: string, reason: string): Promise<void> { const { error } = await getSupabaseBrowserClient().rpc("respond_to_relationship_conflict", { p_relationship_id: relationshipId, p_response: "counter", p_reason: reason }); if (error) throw error; }
  async markResolved(relationshipId: string, userId: string): Promise<void> { const { error } = await getSupabaseBrowserClient().rpc("mark_relationship_resolved_native", { p_relationship_id: relationshipId, p_actor_id: userId }); if (error) throw error; }
}
export const relationshipsService = new RelationshipsService();
