import { presenceService as livePresenceService, type Presence } from "./presence.service";

export interface PresenceResponse { success: boolean; presence?: Presence | null; error?: string; }
export interface OnlineUsersResponse { success: boolean; users?: any[]; error?: string; }
export interface UpdatePresenceRequest { isOnline?: boolean; typingInChatWith?: string; }

class PresenceService {
  async getPresenceByUserId(userId: string): Promise<PresenceResponse> { return { success: true, presence: await livePresenceService.getPresence(userId) }; }
  async updatePresence(userId: string, updates: UpdatePresenceRequest, requesterId?: string): Promise<PresenceResponse> { if (requesterId && requesterId !== userId) return { success: false, error: "You can only update your own presence" }; await livePresenceService.updatePresence(userId, updates.isOnline !== false, updates.typingInChatWith ? "busy" : "active"); return { success: true, presence: await livePresenceService.getPresence(userId) }; }
  async setOnlineStatus(userId: string, isOnline: boolean, requesterId?: string): Promise<PresenceResponse> { return this.updatePresence(userId, { isOnline }, requesterId); }
  async setTypingInChat(userId: string, _chatUserId: string, requesterId?: string): Promise<PresenceResponse> { return this.updatePresence(userId, { isOnline: true, typingInChatWith: _chatUserId }, requesterId); }
  async clearTypingInChat(userId: string, requesterId?: string): Promise<PresenceResponse> { return this.updatePresence(userId, { isOnline: true }, requesterId); }
  async getOnlineUsers(): Promise<OnlineUsersResponse> { return { success: true, users: [] }; }
  async isUserOnline(userId: string): Promise<boolean> { return (await livePresenceService.getPresence(userId))?.is_online === true; }
}
const presenceService = new PresenceService();
export default presenceService;
