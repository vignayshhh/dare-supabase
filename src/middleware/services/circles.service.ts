import { CircleRepository } from "@/backend/repositories/CircleRepository";
import { apiFetch } from "@/lib/apiClient";
export type {
  Circle,
  CircleInvitation,
  CircleInvitePreview,
  CircleEvent,
  CircleMemory,
  CircleEventMessage,
} from "@/backend/repositories/CircleRepository";
import type { CircleInvitePreview } from "@/backend/repositories/CircleRepository";
const repository = new CircleRepository();
export const circlesService = {
  eventMessages: (id: string) => repository.eventMessages(id),
  sendEventMessage: (id: string, body: string) =>
    repository.sendEventMessage(id, body),
  aura: (circleId: string, userId: string) => repository.aura(circleId, userId),
  events: (id: string) => repository.events(id),
  memories: (id: string, eventId?: string) => repository.memories(id, eventId),
  createEvent: (
    id: string,
    userId: string,
    name: string,
    startsAt: string | null,
  ) => repository.createEvent(id, userId, name, startsAt),
  completeEvent: (id: string) => repository.completeEvent(id),
  list: () => repository.list(),
  create: (name: string, avatar: string) => {
    if (!name.trim() || name.trim().length > 80)
      throw new Error("Give your Circle a name, up to 80 characters.");
    return repository.create(name.trim(), avatar);
  },
  manage: (
    id: string,
    action:
      | "rename"
      | "avatar"
      | "invite_permission"
      | "remove"
      | "leave"
      | "transfer"
      | "delete",
    value?: string,
  ) => repository.manage(id, action, value),
  invite: (id: string) => repository.invite(id),
  invitations: (id: string) => repository.invitations(id),
  revoke: (id: string) =>
    repository.rpc<void>("revoke_circle_invitation", { p_invitation: id }),
  preview: (secret: string) =>
    apiFetch<{ preview: CircleInvitePreview }>("/api/circles/invitations", {
      method: "POST",
      body: JSON.stringify({ action: "preview", secret }),
    }).then((r) => r.preview),
  accept: (secret: string) =>
    apiFetch<{ circleId: string }>("/api/circles/invitations", {
      method: "POST",
      body: JSON.stringify({ action: "accept", secret }),
    }).then((r) => r.circleId),
};
