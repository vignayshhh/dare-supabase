// Rumour / promise / custom cards — backed by /api/drama (Postgres
// `drama_posts`). Methods stay synchronous for the UI: optimistic local
// update + background sync.
import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";
import type { DramaInteractionSummary } from "@/types/drama";

export type DramaParticipant = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
};

export type DramaComment = {
  id: string;
  text: string;
  commenter: DramaParticipant;
  createdAt: string;
};

export type RumourVote = "believe" | "cap";
export type RumourStatus = "open" | "confirmed" | "false";

export type RumourPost = {
  id: string;
  statement: string;
  sourceLabel: string;
  heatLabel: string;
  deadline: string;
  createdAt: string;
  poster: DramaParticipant;
  subject?: DramaParticipant;
  votes: Record<string, RumourVote>;
  voters: Record<string, DramaParticipant>;
  comments?: DramaComment[];
  status: RumourStatus;
  darrenNote?: string;
  interactionSummary?: DramaInteractionSummary;
};

export type PromiseVote = "keep" | "break";
export type PromiseStatus = "open" | "kept" | "broken";
export type PromiseAudience = "self" | "friend" | "crew";

export type PromisePost = {
  confirmations?: import("@/components/circles/InteractionConfirmation").InteractionConfirmationState[];
  targetId?: string;
  id: string;
  promise: string;
  audience: PromiseAudience;
  dueAt: string;
  createdAt: string;
  maker: DramaParticipant;
  targetLabel: string;
  votes: Record<string, PromiseVote>;
  voters: Record<string, DramaParticipant>;
  comments?: DramaComment[];
  status: PromiseStatus;
  darrenNote?: string;
  interactionSummary?: DramaInteractionSummary;
};

export type CustomVote = "choiceOne" | "choiceTwo";
export type CustomScope = "friends" | "topics" | "community";

export type CustomPost = {
  id: string;
  statement: string;
  choiceOneText: string;
  choiceTwoText: string;
  toneLabel: string;
  createdAt: string;
  creator: DramaParticipant;
  scope: CustomScope;
  votes: Record<string, CustomVote>;
  voters: Record<string, DramaParticipant>;
  darrenNote?: string;
  interactionSummary?: DramaInteractionSummary;
};

type CreateCustomInput = {
  statement: string;
  choiceOneText: string;
  choiceTwoText: string;
  toneLabel: string;
  creator: DramaParticipant;
  scope: CustomScope;
};

type CreateRumourInput = {
  statement: string;
  sourceLabel: string;
  heatLabel: string;
  deadline: string;
  poster: DramaParticipant;
  subject?: DramaParticipant;
};

type CreatePromiseInput = {
  targetId?: string;
  promise: string;
  audience: PromiseAudience;
  dueAt: string;
  targetLabel: string;
  maker: DramaParticipant;
};

interface DramaStore {
  rumours: RumourPost[];
  promises: PromisePost[];
  customs: CustomPost[];
  hasLoaded: boolean;
  setFromServer: (
    rumours: RumourPost[],
    promises: PromisePost[],
    customs: CustomPost[],
  ) => void;
  mergeFromServer: (rumours: RumourPost[], promises: PromisePost[], customs: CustomPost[]) => void;
  createRumour: (input: CreateRumourInput) => RumourPost;
  createPromise: (input: CreatePromiseInput) => Promise<PromisePost>;
  createCustom: (input: CreateCustomInput) => CustomPost;
  voteRumour: (
    rumourId: string,
    voter: DramaParticipant,
    vote: RumourVote,
  ) => void;
  votePromise: (
    promiseId: string,
    voter: DramaParticipant,
    vote: PromiseVote,
  ) => void;
  voteCustom: (
    customId: string,
    voter: DramaParticipant,
    vote: CustomVote,
  ) => void;
  removeVoteRumour: (rumourId: string, voterId: string) => void;
  removeVotePromise: (promiseId: string, voterId: string) => void;
  removeVoteCustom: (customId: string, voterId: string) => void;
  addDramaComment: (
    postId: string,
    kind: "rumour" | "promise",
    commenter: DramaParticipant,
    text: string,
  ) => void;
  resolveRumour: (rumourId: string, status: Exclude<RumourStatus, "open">) => Promise<void>;
  resolvePromise: (
    promiseId: string,
    status: Exclude<PromiseStatus, "open">,
  ) => Promise<void>;
}

const warnSync = (op: string) => (error: unknown) =>
  console.warn(`[useDramaStore] ${op} sync failed:`, error);

function keepPendingLocal<T extends { id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const serverIds = new Set(incoming.map((post) => post.id));
  const pendingLocal = current.filter(
    (post) => post.id.startsWith("local-") && !serverIds.has(post.id),
  );
  return [...pendingLocal, ...incoming];
}

function syncVote(postId: string, vote: string, op: string) {
  if (postId.startsWith("local-")) return;
  apiFetch(`/api/drama/${postId}/vote`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  }).catch(warnSync(op));
}

function syncRemoveVote(postId: string, op: string) {
  if (postId.startsWith("local-")) return;
  apiFetch(`/api/drama/${postId}/vote`, {
    method: "POST",
    body: JSON.stringify({ remove: true }),
  }).catch(warnSync(op));
}

function syncDramaComment(postId: string, kind: "rumour" | "promise", comment: DramaComment) {
  if (postId.startsWith("local-")) return;
  apiFetch(`/api/drama/${postId}/update`, {
    method: "POST",
    body: JSON.stringify({
      action: "comment",
      kind,
      text: comment.text,
      clientId: comment.id,
      commenter: comment.commenter,
      createdAt: comment.createdAt,
    }),
  }).catch(warnSync("comment"));
}

async function syncResolve(postId: string, value: string, op: string) {
  if (postId.startsWith("local-")) return;
  try {
    await apiFetch(`/api/drama/${postId}/update`, {
      method: "POST",
      body: JSON.stringify({ action: "resolve", value }),
    });
  } catch (error) {
    warnSync(op)(error);
  }
}

export const useDramaStore = create<DramaStore>()((set) => ({
  rumours: [],
  promises: [],
  customs: [],
  hasLoaded: false,

  setFromServer: (rumours, promises, customs) => {
    set((state) => ({
      rumours: keepPendingLocal(state.rumours, rumours),
      promises: keepPendingLocal(state.promises, promises),
      customs: keepPendingLocal(state.customs || [], customs),
      hasLoaded: true,
    }));
  },

  mergeFromServer: (rumours, promises, customs) => {
    set((state) => {
      const merge = <T extends { id: string }>(current: T[], incoming: T[]) => {
        const byId = new Map(incoming.map((post) => [post.id, post]));
        return current.map((post) => byId.get(post.id) || post);
      };
      return {
        rumours: merge(state.rumours, rumours),
        promises: merge(state.promises, promises),
        customs: merge(state.customs, customs),
      };
    });
  },

  createRumour: (input) => {
    const tempId = `local-rumour-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const rumour: RumourPost = {
      id: tempId,
      statement: input.statement.trim(),
      sourceLabel: input.sourceLabel.trim() || "heard around",
      heatLabel: input.heatLabel.trim() || "unverified",
      deadline: input.deadline,
      createdAt: new Date().toISOString(),
      poster: input.poster,
      subject: input.subject,
      votes: {},
      voters: {},
      status: "open",
    };

    set((state) => ({ rumours: [rumour, ...state.rumours] }));

    apiFetch<{ ok?: boolean; post?: RumourPost }>("/api/drama", {
      method: "POST",
      body: JSON.stringify({
        kind: "rumour",
        statement: rumour.statement,
        sourceLabel: rumour.sourceLabel,
        heatLabel: rumour.heatLabel,
        deadline: rumour.deadline,
        ...(rumour.subject && rumour.subject.id
          ? {
              subject: {
                type: "friend",
                id: rumour.subject.id,
                name: rumour.subject.name,
                username: rumour.subject.username,
                avatar: rumour.subject.avatar,
              },
            }
          : {}),
      }),
    })
      .then((response) => {
        if (!response.post) return;
        set((state) => ({
          rumours: state.rumours.map((r) =>
            r.id === tempId ? { ...response.post!, poster: r.poster } : r,
          ),
        }));
      })
      .catch(warnSync("createRumour"));

    return rumour;
  },

  createPromise: (input) => {
    const tempId = `local-promise-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const promise: PromisePost = {
      id: tempId,
      promise: input.promise.trim(),
      audience: input.audience,
      dueAt: input.dueAt,
      createdAt: new Date().toISOString(),
      maker: input.maker,
      targetId: input.targetId,
      targetLabel: input.targetLabel.trim() || "the crew",
      votes: {},
      voters: {},
      status: "open",
    };

    set((state) => ({ promises: [promise, ...state.promises] }));

    return apiFetch<{ ok?: boolean; post?: PromisePost }>("/api/drama", {
      method: "POST",
      body: JSON.stringify({
        kind: "promise",
        promise: promise.promise,
        audience: promise.audience,
        dueAt: promise.dueAt,
        targetLabel: promise.targetLabel,
        targetId: promise.targetId,
      }),
    })
      .then((response) => {
        if (!response.post) throw new Error("Creation returned no saved card");
        set((state) => ({
          promises: state.promises.map((p) =>
            p.id === tempId ? { ...response.post!, maker: p.maker } : p,
          ),
        }));
        return response.post;
      })
      .catch((error) => {
        set(state => ({ promises: state.promises.filter(post => post.id !== tempId) }));
        throw error;
      });

  },

  createCustom: (input) => {
    const tempId = `local-custom-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const custom: CustomPost = {
      id: tempId,
      statement: input.statement.trim(),
      choiceOneText: input.choiceOneText.trim(),
      choiceTwoText: input.choiceTwoText.trim(),
      toneLabel: input.toneLabel.trim() || "anything",
      createdAt: new Date().toISOString(),
      creator: input.creator,
      scope: input.scope,
      votes: {},
      voters: {},
    };

    set((state) => ({ customs: [custom, ...(state.customs || [])] }));

    apiFetch<{ ok?: boolean; post?: CustomPost }>("/api/drama", {
      method: "POST",
      body: JSON.stringify({
        kind: "custom",
        statement: custom.statement,
        choiceOneText: custom.choiceOneText,
        choiceTwoText: custom.choiceTwoText,
        toneLabel: custom.toneLabel,
        scope: custom.scope,
      }),
    })
      .then((response) => {
        if (!response.post) return;
        set((state) => ({
          customs: (state.customs || []).map((c) =>
            c.id === tempId ? { ...response.post!, creator: c.creator } : c,
          ),
        }));
      })
      .catch(warnSync("create"));

    return custom;
  },

  voteRumour: (rumourId, voter, vote) => {
    set((state) => ({
      rumours: state.rumours.map((rumour) =>
        rumour.id === rumourId && rumour.status === "open"
          ? {
              ...rumour,
              votes: { ...rumour.votes, [voter.id]: vote },
              voters: { ...rumour.voters, [voter.id]: voter },
            }
          : rumour,
      ),
    }));
    syncVote(rumourId, vote, "voteRumour");
  },

  votePromise: (promiseId, voter, vote) => {
    set((state) => ({
      promises: state.promises.map((promise) =>
        promise.id === promiseId && promise.status === "open"
          ? {
              ...promise,
              votes: { ...promise.votes, [voter.id]: vote },
              voters: { ...promise.voters, [voter.id]: voter },
            }
          : promise,
      ),
    }));
    syncVote(promiseId, vote, "votePromise");
  },

  voteCustom: (customId, voter, vote) => {
    set((state) => ({
      customs: (state.customs || []).map((custom) =>
        custom.id === customId
          ? {
              ...custom,
              votes: { ...custom.votes, [voter.id]: vote },
              voters: { ...custom.voters, [voter.id]: voter },
            }
          : custom,
      ),
    }));
    syncVote(customId, vote, "voteCustom");
  },

  removeVoteRumour: (rumourId, voterId) => {
    set((state) => ({
      rumours: state.rumours.map((rumour) => {
        if (rumour.id !== rumourId || rumour.status !== "open") return rumour;
        const votes = { ...rumour.votes };
        const voters = { ...rumour.voters };
        delete votes[voterId];
        delete voters[voterId];
        return { ...rumour, votes, voters };
      }),
    }));
    syncRemoveVote(rumourId, "removeVoteRumour");
  },

  removeVotePromise: (promiseId, voterId) => {
    set((state) => ({
      promises: state.promises.map((promise) => {
        if (promise.id !== promiseId || promise.status !== "open") return promise;
        const votes = { ...promise.votes };
        const voters = { ...promise.voters };
        delete votes[voterId];
        delete voters[voterId];
        return { ...promise, votes, voters };
      }),
    }));
    syncRemoveVote(promiseId, "removeVotePromise");
  },

  removeVoteCustom: (customId, voterId) => {
    set((state) => ({
      customs: (state.customs || []).map((custom) => {
        if (custom.id !== customId) return custom;
        const votes = { ...custom.votes };
        const voters = { ...custom.voters };
        delete votes[voterId];
        delete voters[voterId];
        return { ...custom, votes, voters };
      }),
    }));
    syncRemoveVote(customId, "removeVoteCustom");
  },

  addDramaComment: (postId, kind, commenter, text) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const comment: DramaComment = {
      id: `local-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: trimmedText,
      commenter,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      rumours: state.rumours.map((post) =>
        kind === "rumour" && post.id === postId
          ? { ...post, comments: [...(post.comments || []), comment] }
          : post,
      ),
      promises: state.promises.map((post) =>
        kind === "promise" && post.id === postId
          ? { ...post, comments: [...(post.comments || []), comment] }
          : post,
      ),
    }));
    syncDramaComment(postId, kind, comment);
  },

  resolveRumour: async (rumourId, status) => {
    set((state) => ({
      rumours: state.rumours.map((rumour) =>
        rumour.id === rumourId ? { ...rumour, status } : rumour,
      ),
    }));
    await syncResolve(rumourId, status, "resolveRumour");
  },

  resolvePromise: async (promiseId, status) => {
    set((state) => ({
      promises: state.promises.map((promise) =>
        promise.id === promiseId ? { ...promise, status } : promise,
      ),
    }));
    await syncResolve(promiseId, status, "resolvePromise");
  },
}));
