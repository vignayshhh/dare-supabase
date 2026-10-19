import { circlesService, type Circle } from "./circles.service";
/** Compatibility DTO for existing feed scrapbook consumers. */
export interface CircleRecord {
  id: string;
  owner_id: string;
  name: string;
  member_ids: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
const map = (c: Circle): CircleRecord => ({
  id: c.id,
  owner_id: c.ownerId,
  name: c.name,
  member_ids: c.members.map((m) => m.id),
  created_at: c.createdAt,
  updated_at: c.createdAt,
  deleted_at: null,
});
class CircleService {
  private cache = new Map<string, CircleRecord[]>();
  getCachedCircles(userId: string) {
    return this.cache.get(userId) ?? [];
  }
  async loadCircles(userId: string, _force = false) {
    const rows = (await circlesService.list()).map(map);
    this.cache.set(userId, rows);
    return rows;
  }
  async createCircle(userId: string, name: string) {
    const id = await circlesService.create(name, "??");
    const rows = await this.loadCircles(userId);
    const created = rows.find((c) => c.id === id);
    if (!created) throw new Error("Circle unavailable");
    return created;
  }
  async renameCircle(userId: string, id: string, name: string) {
    await circlesService.manage(id, "rename", name);
    await this.loadCircles(userId);
  }
  async deleteCircle(userId: string, id: string) {
    await circlesService.manage(id, "delete");
    await this.loadCircles(userId);
  }
}
export const circleService = new CircleService();
