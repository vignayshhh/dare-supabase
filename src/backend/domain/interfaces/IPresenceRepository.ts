export interface Presence {
  id: string;
  userId: string;
  isOnline: boolean;
  lastSeen: string;
  typingInChatWith: string | null;
  updatedAt: string;
}

export interface UpdatePresenceRequest {
  isOnline?: boolean;
  typingInChatWith?: string;
}

export interface IPresenceRepository {
  getPresenceByUserId(userId: string): Promise<Presence | null>;
  updatePresence(
    userId: string,
    updates: UpdatePresenceRequest,
  ): Promise<Presence>;
  setOnlineStatus(userId: string, isOnline: boolean): Promise<Presence>;
  setTypingInChat(userId: string, chatUserId: string): Promise<Presence>;
  clearTypingInChat(userId: string): Promise<Presence>;
  getOnlineUsers(): Promise<Presence[]>;
  ensurePresenceExists(userId: string): Promise<Presence>;
}
