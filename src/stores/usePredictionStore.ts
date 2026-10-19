// Prediction cards — backed by /api/drama (Postgres `drama_posts`).
// Methods stay synchronous for the UI: they apply optimistic local updates
// and sync to the backend in the background.
import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";
import type { DramaInteractionSummary } from "@/types/drama";

export type PredictionSubject =
  | {
      type: "friend";
      id: string;
      name: string;
      username?: string;
      avatar?: string;
    }
  | {
      type: "group";
      name: string;
    }
  | {
      type: "event";
      name: string;
    };

export type PredictionVote = "happens" | "wont";
export type PredictionReaction = "knows" | "accurate" | "wrong";
export type PredictionVerdict = "happened" | "didnt";

export type PredictionParticipant = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
};

export type PredictionComment = {
  id: string;
  text: string;
  commenter: PredictionParticipant;
  createdAt: string;
};

export type PredictionPost = {
  id: string;
  text: string;
  subject: PredictionSubject;
  deadline: string;
  createdAt: string;
  poster: PredictionParticipant;
  votes: Record<string, PredictionVote>;
  voters: Record<string, PredictionParticipant>;
  subjectReaction?: PredictionReaction;
  subjectOutcome?: PredictionVote;
  subjectThought?: string;
  comments?: PredictionComment[];
  verdict?: PredictionVerdict;
  resolvedAt?: string;
  interactionSummary?: DramaInteractionSummary;
};

type CreatePredictionInput = {
  text: string;
  subject: PredictionSubject;
  deadline: string;
  poster: PredictionParticipant;
};

interface PredictionStore {
  predictions: PredictionPost[];
  hasLoaded: boolean;
  setFromServer: (posts: PredictionPost[]) => void;
  mergeFromServer: (posts: PredictionPost[]) => void;
  createPrediction: (input: CreatePredictionInput) => Promise<PredictionPost>;
  votePrediction: (
    predictionId: string,
    voter: PredictionParticipant,
    vote: PredictionVote,
  ) => void;
  removeVotePrediction: (predictionId: string, voterId: string) => void;
  reactAsSubject: (
    predictionId: string,
    reaction: PredictionReaction,
  ) => void;
  respondAsSubject: (
    predictionId: string,
    outcome: PredictionVote,
    thought: string,
  ) => void;
  addPredictionComment: (
    predictionId: string,
    commenter: PredictionParticipant,
    text: string,
  ) => void;
  resolvePrediction: (
    predictionId: string,
    verdict: PredictionVerdict,
  ) => Promise<void>;
}

const warnSync = (op: string) => (error: unknown) =>
  console.warn(`[usePredictionStore] ${op} sync failed:`, error);

export const usePredictionStore = create<PredictionStore>()((set) => ({
  predictions: [],
  hasLoaded: false,

  setFromServer: (posts) => {
    set((state) => {
      // Keep optimistic (not-yet-synced) temp posts on top of the snapshot.
      const serverIds = new Set(posts.map((post) => post.id));
      const pendingLocal = state.predictions.filter(
        (post) => post.id.startsWith("local-") && !serverIds.has(post.id),
      );
      return { predictions: [...pendingLocal, ...posts], hasLoaded: true };
    });
  },

  mergeFromServer: (posts) => {
    if (!posts.length) return;
    set((state) => {
      const incoming = new Map(posts.map((post) => [post.id, post]));
      return { predictions: state.predictions.map((post) => incoming.get(post.id) || post) };
    });
  },

  createPrediction: (input) => {
    const tempId = `local-prediction-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const prediction: PredictionPost = {
      id: tempId,
      text: input.text.trim(),
      subject: input.subject,
      deadline: input.deadline,
      createdAt: new Date().toISOString(),
      poster: input.poster,
      votes: {},
      voters: {},
    };

    set((state) => ({ predictions: [prediction, ...state.predictions] }));

    return apiFetch<{ ok?: boolean; post?: PredictionPost }>("/api/drama", {
      method: "POST",
      body: JSON.stringify({
        kind: "prediction",
        text: prediction.text,
        subject: prediction.subject,
        deadline: prediction.deadline,
      }),
    })
      .then((response) => {
        if (!response.post) throw new Error("Creation returned no saved card");
        set((state) => ({
          predictions: state.predictions.map((p) =>
            p.id === tempId ? { ...response.post!, poster: p.poster } : p,
          ),
        }));
        return response.post;
      })
      .catch((error) => {
        set(state => ({ predictions: state.predictions.filter(post => post.id !== tempId) }));
        throw error;
      });

  },

  votePrediction: (predictionId, voter, vote) => {
    set((state) => ({
      predictions: state.predictions.map((prediction) => {
        if (prediction.id !== predictionId || prediction.verdict) {
          return prediction;
        }
        return {
          ...prediction,
          votes: { ...prediction.votes, [voter.id]: vote },
          voters: { ...prediction.voters, [voter.id]: voter },
        };
      }),
    }));

    if (!predictionId.startsWith("local-")) {
      apiFetch(`/api/drama/${predictionId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      }).catch(warnSync("vote"));
    }
  },

  removeVotePrediction: (predictionId, voterId) => {
    set((state) => ({
      predictions: state.predictions.map((prediction) => {
        if (prediction.id !== predictionId || prediction.verdict) {
          return prediction;
        }
        const votes = { ...prediction.votes };
        const voters = { ...prediction.voters };
        delete votes[voterId];
        delete voters[voterId];
        return { ...prediction, votes, voters };
      }),
    }));

    if (!predictionId.startsWith("local-")) {
      apiFetch(`/api/drama/${predictionId}/vote`, {
        method: "POST",
        body: JSON.stringify({ remove: true }),
      }).catch(warnSync("remove vote"));
    }
  },

  reactAsSubject: (predictionId, reaction) => {
    set((state) => ({
      predictions: state.predictions.map((prediction) =>
        prediction.id === predictionId && !prediction.verdict
          ? { ...prediction, subjectReaction: reaction }
          : prediction,
      ),
    }));

    if (!predictionId.startsWith("local-")) {
      apiFetch(`/api/drama/${predictionId}/update`, {
        method: "POST",
        body: JSON.stringify({ action: "react", value: reaction }),
      }).catch(warnSync("react"));
    }
  },

  respondAsSubject: (predictionId, outcome, thought) => {
    const trimmedThought = thought.trim();
    set((state) => ({
      predictions: state.predictions.map((prediction) =>
        prediction.id === predictionId && !prediction.verdict
          ? {
              ...prediction,
              subjectOutcome: outcome,
              subjectThought: trimmedThought,
            }
          : prediction,
      ),
    }));

    if (!predictionId.startsWith("local-")) {
      apiFetch(`/api/drama/${predictionId}/update`, {
        method: "POST",
        body: JSON.stringify({
          action: "subject_response",
          outcome,
          thought: trimmedThought,
        }),
      }).catch(warnSync("subject_response"));
    }
  },

  addPredictionComment: (predictionId, commenter, text) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const comment: PredictionComment = {
      id: `local-comment-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      text: trimmedText,
      commenter,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      predictions: state.predictions.map((prediction) =>
        prediction.id === predictionId
          ? {
              ...prediction,
              comments: [...(prediction.comments || []), comment],
            }
          : prediction,
      ),
    }));

    if (!predictionId.startsWith("local-")) {
      apiFetch(`/api/drama/${predictionId}/update`, {
        method: "POST",
        body: JSON.stringify({
          action: "comment",
          text: trimmedText,
          commenter,
          clientId: comment.id,
          createdAt: comment.createdAt,
        }),
      }).catch(warnSync("comment"));
    }
  },

  resolvePrediction: async (predictionId, verdict) => {
    set((state) => ({
      predictions: state.predictions.map((prediction) =>
        prediction.id === predictionId
          ? { ...prediction, verdict, resolvedAt: new Date().toISOString() }
          : prediction,
      ),
    }));

    if (!predictionId.startsWith("local-")) {
      try {
        await apiFetch(`/api/drama/${predictionId}/update`, {
          method: "POST",
          body: JSON.stringify({ action: "resolve", value: verdict }),
        });
      } catch (error) {
        warnSync("resolve")(error);
      }
    }
  },
}));
