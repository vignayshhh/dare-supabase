// Deal/bet cards — backed by /api/drama (Postgres `drama_posts`).
// Methods stay synchronous for the UI: optimistic local update + background sync.
import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";
import type {
  PredictionParticipant,
  PredictionSubject,
  PredictionVote,
} from "./usePredictionStore";
import type { DramaInteractionSummary } from "@/types/drama";

export type DealScope = "self" | "friend" | "group" | "crew";
export type DealResult = "won" | "lost" | "progress";

export type DealPost = {
  confirmations?: import("@/components/circles/InteractionConfirmation").InteractionConfirmationState[];
  id: string;
  scope: DealScope;
  subject: PredictionSubject;
  event: string;
  winOutcome: string;
  loseOutcome: string;
  resolutionDate: string;
  createdAt: string;
  creator: PredictionParticipant;
  votes: Record<string, PredictionVote>;
  voters: Record<string, PredictionParticipant>;
  result?: DealResult;
  resolvedAt?: string;
  proofUrl?: string;
  proofLabel?: string;
  interactionSummary?: DramaInteractionSummary;
};

type CreateDealInput = {
  scope: DealScope;
  subject: PredictionSubject;
  event: string;
  winOutcome: string;
  loseOutcome: string;
  resolutionDate: string;
  creator: PredictionParticipant;
};

interface DealStore {
  deals: DealPost[];
  hasLoaded: boolean;
  setFromServer: (posts: DealPost[]) => void;
  mergeFromServer: (posts: DealPost[]) => void;
  createDeal: (input: CreateDealInput) => Promise<DealPost>;
  voteDeal: (
    dealId: string,
    voter: PredictionParticipant,
    vote: PredictionVote,
  ) => void;
  removeVoteDeal: (dealId: string, voterId: string) => void;
  resolveDeal: (dealId: string, result: DealResult) => Promise<void>;
  attachProof: (dealId: string, proofLabel: string, proofUrl?: string) => void;
}

const warnSync = (op: string) => (error: unknown) =>
  console.warn(`[useDealStore] ${op} sync failed:`, error);

export const useDealStore = create<DealStore>()((set) => ({
  deals: [],
  hasLoaded: false,

  setFromServer: (posts) => {
    set((state) => {
      const serverIds = new Set(posts.map((post) => post.id));
      const pendingLocal = state.deals.filter(
        (post) => post.id.startsWith("local-") && !serverIds.has(post.id),
      );
      return { deals: [...pendingLocal, ...posts], hasLoaded: true };
    });
  },

  mergeFromServer: (posts) => {
    if (!posts.length) return;
    set((state) => {
      const incoming = new Map(posts.map((post) => [post.id, post]));
      return { deals: state.deals.map((post) => incoming.get(post.id) || post) };
    });
  },

  createDeal: (input) => {
    const tempId = `local-deal-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const deal: DealPost = {
      id: tempId,
      scope: input.scope,
      subject: input.subject,
      event: input.event.trim(),
      winOutcome: input.winOutcome.trim(),
      loseOutcome: input.loseOutcome.trim(),
      resolutionDate: input.resolutionDate,
      createdAt: new Date().toISOString(),
      creator: input.creator,
      votes: {},
      voters: {},
    };

    set((state) => ({ deals: [deal, ...state.deals] }));

    return apiFetch<{ ok?: boolean; post?: DealPost }>("/api/drama", {
      method: "POST",
      body: JSON.stringify({
        kind: "deal",
        scope: deal.scope,
        subject: deal.subject,
        event: deal.event,
        winOutcome: deal.winOutcome,
        loseOutcome: deal.loseOutcome,
        resolutionDate: deal.resolutionDate,
      }),
    })
      .then((response) => {
        if (!response.post) throw new Error("Creation returned no saved card");
        set((state) => ({
          deals: state.deals.map((d) =>
            d.id === tempId ? { ...response.post!, creator: d.creator } : d,
          ),
        }));
        return response.post;
      })
      .catch((error) => {
        set(state => ({ deals: state.deals.filter(post => post.id !== tempId) }));
        throw error;
      });

  },

  voteDeal: (dealId, voter, vote) => {
    set((state) => ({
      deals: state.deals.map((deal) =>
        deal.id === dealId && !deal.result
          ? {
              ...deal,
              votes: { ...deal.votes, [voter.id]: vote },
              voters: { ...deal.voters, [voter.id]: voter },
            }
          : deal,
      ),
    }));

    if (!dealId.startsWith("local-")) {
      apiFetch(`/api/drama/${dealId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      }).catch(warnSync("vote"));
    }
  },

  removeVoteDeal: (dealId, voterId) => {
    set((state) => ({
      deals: state.deals.map((deal) => {
        if (deal.id !== dealId || deal.result) return deal;
        const votes = { ...deal.votes };
        const voters = { ...deal.voters };
        delete votes[voterId];
        delete voters[voterId];
        return { ...deal, votes, voters };
      }),
    }));

    if (!dealId.startsWith("local-")) {
      apiFetch(`/api/drama/${dealId}/vote`, {
        method: "POST",
        body: JSON.stringify({ remove: true }),
      }).catch(warnSync("remove vote"));
    }
  },

  resolveDeal: async (dealId, result) => {
    set((state) => ({
      deals: state.deals.map((deal) =>
        deal.id === dealId
          ? { ...deal, result, resolvedAt: new Date().toISOString() }
          : deal,
      ),
    }));

    if (!dealId.startsWith("local-")) {
      try {
        await apiFetch(`/api/drama/${dealId}/update`, {
          method: "POST",
          body: JSON.stringify({ action: "resolve", value: result }),
        });
      } catch (error) {
        warnSync("resolve")(error);
      }
    }
  },

  attachProof: (dealId, proofLabel, proofUrl) => {
    set((state) => ({
      deals: state.deals.map((deal) =>
        deal.id === dealId
          ? { ...deal, proofLabel: proofLabel.trim(), proofUrl }
          : deal,
      ),
    }));

    if (!dealId.startsWith("local-")) {
      apiFetch(`/api/drama/${dealId}/update`, {
        method: "POST",
        body: JSON.stringify({
          action: "proof",
          label: proofLabel,
          url: proofUrl,
        }),
      }).catch(warnSync("proof"));
    }
  },
}));
