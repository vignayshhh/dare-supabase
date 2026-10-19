import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AlertEntity, AlertType } from "../domain/entities/Alert";

export interface IAlertRepository {
  createAlert(alert: AlertEntity): Promise<void>;
  getAlertsForUser(userId: string, limit?: number, offset?: number, unreadOnly?: boolean): Promise<AlertEntity[]>;
  markAlertAsRead(alertId: string, userId: string): Promise<void>;
  markAllAlertsAsRead(userId: string): Promise<void>;
  deleteAlert(alertId: string, userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  updateAlert(alertId: string, userId: string, updates: Partial<AlertEntity>): Promise<void>;
}

type AlertRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  payload: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
};

function toEntity(row: AlertRow): AlertEntity {
  const payload = row.payload ?? {};
  return AlertEntity.create({
    id: row.id,
    userId: row.recipient_id,
    type: row.type as AlertType,
    entityId: typeof payload.entityId === "string" ? payload.entityId : "",
    actorId: row.actor_id ?? "",
    message: typeof payload.message === "string" ? payload.message : "",
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : payload,
    isRead: row.read_at !== null,
    createdAt: row.created_at,
    updatedAt: row.read_at ?? row.created_at,
  });
}

export class AlertRepository implements IAlertRepository {
  private get client() { return getSupabaseBrowserClient(); }

  async createAlert(alert: AlertEntity): Promise<void> {
    const { error } = await this.client.from("alerts").insert({
      id: alert.id,
      recipient_id: alert.userId,
      actor_id: alert.actorId || null,
      type: alert.type,
      payload: { ...alert.metadata, metadata: alert.metadata, entityId: alert.entityId, message: alert.message },
      read_at: alert.isRead ? alert.updatedAt : null,
      created_at: alert.createdAt,
    });
    if (error) throw error;
  }

  async getAlertsForUser(userId: string, limitCount = 20, offset = 0, unreadOnly = false): Promise<AlertEntity[]> {
    let request = this.client.from("alerts")
      .select("id,recipient_id,actor_id,type,payload,read_at,created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(Math.max(0, offset), Math.max(0, offset) + Math.min(100, Math.max(1, limitCount)) - 1);
    if (unreadOnly) request = request.is("read_at", null);
    const { data, error } = await request;
    if (error) throw error;
    return (data as AlertRow[] | null ?? []).map(toEntity);
  }

  async markAlertAsRead(alertId: string, userId: string): Promise<void> {
    const { error } = await this.client.from("alerts").update({ read_at: new Date().toISOString() }).eq("id", alertId).eq("recipient_id", userId);
    if (error) throw error;
  }

  async markAllAlertsAsRead(userId: string): Promise<void> {
    const { error } = await this.client.from("alerts").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).is("read_at", null);
    if (error) throw error;
  }

  async deleteAlert(alertId: string, userId: string): Promise<void> {
    const { error } = await this.client.from("alerts").delete().eq("id", alertId).eq("recipient_id", userId);
    if (error) throw error;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.client.from("alerts").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  }

  async updateAlert(alertId: string, userId: string, updates: Partial<AlertEntity>): Promise<void> {
    const current = await this.client.from("alerts").select("payload,read_at").eq("id", alertId).eq("recipient_id", userId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new Error("Alert not found");
    const payload = { ...(current.data.payload as Record<string, any> ?? {}) };
    if (updates.message !== undefined) payload.message = updates.message;
    if (updates.entityId !== undefined) payload.entityId = updates.entityId;
    if (updates.metadata !== undefined) Object.assign(payload, updates.metadata, { metadata: updates.metadata });
    const patch: Record<string, unknown> = { payload };
    if (updates.type !== undefined) patch.type = updates.type;
    if (updates.actorId !== undefined) patch.actor_id = updates.actorId || null;
    if (updates.isRead !== undefined) patch.read_at = updates.isRead ? new Date().toISOString() : null;
    const { error } = await this.client.from("alerts").update(patch).eq("id", alertId).eq("recipient_id", userId);
    if (error) throw error;
  }
}
