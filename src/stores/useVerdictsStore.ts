import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";
import type {
  VerdictChoice,
  VerdictCommentDTO,
  VerdictDTO,
  VerdictMediaType,
  VerdictScope,
} from "@/types/verdict";

interface CreateVerdictInput {
  question: string;
  description: string;
  choiceOneText: string;
  choiceTwoText: string;
  mediaUrl: string;
  mediaType: VerdictMediaType;
  scope: VerdictScope;
  topic?: string | null;
}

interface VerdictsStore {
  friends: VerdictDTO[];
  topics: VerdictDTO[];
  commentsByVerdictId: Record<string, VerdictCommentDTO[]>;
  commentCursorByVerdictId: Record<string, string | null>;
  commentsHasMoreByVerdictId: Record<string, boolean>;
  loading: boolean;
  loadingMore: boolean;
  creating: boolean;
  votingById: Record<string, boolean>;
  commentLoadingById: Record<string, boolean>;
  cursorByScope: Record<VerdictScope, string | null>;
  hasMoreByScope: Record<VerdictScope, boolean>;
  error: string | null;
  loadVerdicts: (scope: VerdictScope, opts?: { reset?: boolean; topic?: string }) => Promise<void>;
  createVerdict: (input: CreateVerdictInput) => Promise<VerdictDTO>;
  vote: (verdictId: string, choice: VerdictChoice) => Promise<void>;
  removeVote: (verdictId: string) => Promise<void>;
  loadComments: (
    verdictId: string,
    opts?: { append?: boolean; force?: boolean },
  ) => Promise<void>;
  addComment: (verdictId: string, text: string, parentId?: string | null) => Promise<void>;
}

const mergeVerdicts = (existing: VerdictDTO[], incoming: VerdictDTO[]) => {
  const byId = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
      b.id.localeCompare(a.id),
  );
};

const updateVerdict = (
  items: VerdictDTO[],
  verdictId: string,
  updater: (verdict: VerdictDTO) => VerdictDTO,
) => items.map((item) => (item.id === verdictId ? updater(item) : item));

const applyVote = (verdict: VerdictDTO, choice: VerdictChoice): VerdictDTO => {
  if (verdict.my_vote === choice) return verdict;

  const wasOne = verdict.my_vote === "one";
  const wasTwo = verdict.my_vote === "two";
  const nextOne =
    verdict.choice_one_votes + (choice === "one" ? 1 : 0) - (wasOne ? 1 : 0);
  const nextTwo =
    verdict.choice_two_votes + (choice === "two" ? 1 : 0) - (wasTwo ? 1 : 0);

  return {
    ...verdict,
    my_vote: choice,
    choice_one_votes: Math.max(0, nextOne),
    choice_two_votes: Math.max(0, nextTwo),
    total_votes: Math.max(0, nextOne) + Math.max(0, nextTwo),
  };
};

const removeVoteFromVerdict = (verdict: VerdictDTO): VerdictDTO => {
  if (!verdict.my_vote) return verdict;

  const nextOne =
    verdict.choice_one_votes - (verdict.my_vote === "one" ? 1 : 0);
  const nextTwo =
    verdict.choice_two_votes - (verdict.my_vote === "two" ? 1 : 0);

  return {
    ...verdict,
    my_vote: null,
    choice_one_votes: Math.max(0, nextOne),
    choice_two_votes: Math.max(0, nextTwo),
    total_votes: Math.max(0, nextOne) + Math.max(0, nextTwo),
  };
};

interface VerdictCachePayload {
  friends: VerdictDTO[];
  topics: VerdictDTO[];
  cursorByScope: Record<VerdictScope, string | null>;
  hasMoreByScope: Record<VerdictScope, boolean>;
}

const VERDICT_CACHE_KEY = "dare-verdict-cache:v1";
const activeVerdictLoads = new Set<string>();

const readVerdictCache = (): VerdictCachePayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VERDICT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VerdictCachePayload>;
    if (!Array.isArray(parsed.friends) || !Array.isArray(parsed.topics)) {
      return null;
    }
    return {
      friends: parsed.friends as VerdictDTO[],
      topics: parsed.topics as VerdictDTO[],
      cursorByScope: {
        friends: parsed.cursorByScope?.friends ?? null,
        topics: parsed.cursorByScope?.topics ?? null,
      },
      hasMoreByScope: {
        friends: parsed.hasMoreByScope?.friends ?? true,
        topics: parsed.hasMoreByScope?.topics ?? true,
      },
    };
  } catch {
    return null;
  }
};

const persistVerdictCache = (payload: VerdictCachePayload) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VERDICT_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / private browsing failures.
  }
};

const cachedVerdicts: VerdictCachePayload | null = null as VerdictCachePayload | null;

export const useVerdictsStore = create<VerdictsStore>((set, get) => ({
  friends: cachedVerdicts?.friends || [],
  topics: cachedVerdicts?.topics || [],
  commentsByVerdictId: {},
  commentCursorByVerdictId: {},
  commentsHasMoreByVerdictId: {},
  loading: false,
  loadingMore: false,
  creating: false,
  votingById: {},
  commentLoadingById: {},
  cursorByScope: cachedVerdicts?.cursorByScope || { friends: null, topics: null },
  hasMoreByScope: cachedVerdicts?.hasMoreByScope || { friends: true, topics: true },
  error: null,

  loadVerdicts: async (scope, opts = {}) => {
    const reset = opts.reset ?? false;
    const cursor = reset ? null : get().cursorByScope[scope];
    const requestKey = `${scope}:${opts.topic || ""}:${reset ? "reset" : cursor || "first"}`;
    if (activeVerdictLoads.has(requestKey)) return;
    activeVerdictLoads.add(requestKey);
    const firstLoad = reset || get()[scope].length === 0;
    set({
      loading: firstLoad,
      loadingMore: !firstLoad,
      error: null,
      ...(reset
        ? {
            cursorByScope: { ...get().cursorByScope, [scope]: null },
            hasMoreByScope: { ...get().hasMoreByScope, [scope]: true },
          }
        : {}),
    });

    try {
      const params = new URLSearchParams({
        scope,
        limit: "12",
      });
      if (cursor) params.set("cursor", cursor);
      if (scope === "topics" && opts.topic) params.set("topic", opts.topic);

      const response = await apiFetch<{
        ok: boolean;
        verdicts: VerdictDTO[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(`/api/verdicts?${params.toString()}`, {
        method: "GET",
        skipCsrf: true,
      } as RequestInit & { skipCsrf?: boolean });

      const current = get();
      const nextVerdicts =
        response.verdicts.length > 0
          ? reset
            ? response.verdicts
            : mergeVerdicts(current[scope], response.verdicts)
          : current[scope];
      const nextCursorByScope = {
        ...current.cursorByScope,
        [scope]: response.nextCursor,
      };
      const nextHasMoreByScope = {
        ...current.hasMoreByScope,
        [scope]: response.hasMore,
      };

      set({
        [scope]: nextVerdicts,
        cursorByScope: nextCursorByScope,
        hasMoreByScope: nextHasMoreByScope,
      });
      persistVerdictCache({
        friends: scope === "friends" ? nextVerdicts : current.friends,
        topics: scope === "topics" ? nextVerdicts : current.topics,
        cursorByScope: nextCursorByScope,
        hasMoreByScope: nextHasMoreByScope,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to load verdicts" });
    } finally {
      activeVerdictLoads.delete(requestKey);
      set({ loading: false, loadingMore: false });
    }
  },

  createVerdict: async (input) => {
    set({ creating: true, error: null });
    try {
      const response = await apiFetch<{ ok: boolean; verdict: VerdictDTO }>(
        "/api/verdicts",
        {
          method: "POST",
          body: JSON.stringify({
            question: input.question,
            description: input.description,
            choice_one_text: input.choiceOneText,
            choice_two_text: input.choiceTwoText,
            media_url: input.mediaUrl,
            media_type: input.mediaType,
            scope: input.scope,
            topic: input.topic || null,
          }),
        },
      );

      const current = get();
      const nextVerdicts = mergeVerdicts(current[input.scope], [response.verdict]);
      set({
        [input.scope]: nextVerdicts,
      });
      persistVerdictCache({
        friends: input.scope === "friends" ? nextVerdicts : current.friends,
        topics: input.scope === "topics" ? nextVerdicts : current.topics,
        cursorByScope: current.cursorByScope,
        hasMoreByScope: current.hasMoreByScope,
      });
      return response.verdict;
    } finally {
      set({ creating: false });
    }
  },

  vote: async (verdictId, choice) => {
    const allVerdicts = [...get().friends, ...get().topics];
    const current = allVerdicts.find((item) => item.id === verdictId);
    if (!current || current.my_vote === choice) return;

    set((state) => ({
      friends: updateVerdict(state.friends, verdictId, (item) =>
        applyVote(item, choice),
      ),
      topics: updateVerdict(state.topics, verdictId, (item) =>
        applyVote(item, choice),
      ),
      votingById: { ...state.votingById, [verdictId]: true },
    }));

    try {
      const response = await apiFetch<{ ok: boolean; verdict: VerdictDTO }>(
        `/api/verdicts/${encodeURIComponent(verdictId)}/vote`,
        {
          method: "POST",
          body: JSON.stringify({ choice }),
        },
      );
      const current = get();
      const nextFriends = updateVerdict(current.friends, verdictId, () => response.verdict);
      const nextTopics = updateVerdict(current.topics, verdictId, () => response.verdict);
      set({
        friends: nextFriends,
        topics: nextTopics,
      });
      persistVerdictCache({
        friends: nextFriends,
        topics: nextTopics,
        cursorByScope: current.cursorByScope,
        hasMoreByScope: current.hasMoreByScope,
      });
    } catch (error) {
      set((state) => ({
        friends: updateVerdict(state.friends, verdictId, () => current),
        topics: updateVerdict(state.topics, verdictId, () => current),
        error: error instanceof Error ? error.message : "Failed to vote",
      }));
    } finally {
      set((state) => ({
        votingById: { ...state.votingById, [verdictId]: false },
      }));
    }
  },

  removeVote: async (verdictId) => {
    const allVerdicts = [...get().friends, ...get().topics];
    const current = allVerdicts.find((item) => item.id === verdictId);
    if (!current || !current.my_vote) return;

    set((state) => ({
      friends: updateVerdict(state.friends, verdictId, removeVoteFromVerdict),
      topics: updateVerdict(state.topics, verdictId, removeVoteFromVerdict),
      votingById: { ...state.votingById, [verdictId]: true },
    }));

    try {
      const response = await apiFetch<{ ok: boolean; verdict: VerdictDTO }>(
        `/api/verdicts/${encodeURIComponent(verdictId)}/vote`,
        { method: "DELETE" },
      );
      const currentState = get();
      const nextFriends = updateVerdict(
        currentState.friends,
        verdictId,
        () => response.verdict,
      );
      const nextTopics = updateVerdict(
        currentState.topics,
        verdictId,
        () => response.verdict,
      );
      set({
        friends: nextFriends,
        topics: nextTopics,
      });
      persistVerdictCache({
        friends: nextFriends,
        topics: nextTopics,
        cursorByScope: currentState.cursorByScope,
        hasMoreByScope: currentState.hasMoreByScope,
      });
    } catch (error) {
      set((state) => ({
        friends: updateVerdict(state.friends, verdictId, () => current),
        topics: updateVerdict(state.topics, verdictId, () => current),
        error: error instanceof Error ? error.message : "Failed to remove vote",
      }));
    } finally {
      set((state) => ({
        votingById: { ...state.votingById, [verdictId]: false },
      }));
    }
  },

  loadComments: async (verdictId, opts = {}) => {
    const append = opts.append ?? false;
    if (!append && !opts.force && get().commentsByVerdictId[verdictId]) return;
    if (get().commentLoadingById[verdictId]) return;
    const cursor = append ? get().commentCursorByVerdictId[verdictId] : null;
    if (append && !get().commentsHasMoreByVerdictId[verdictId]) return;

    set((state) => ({
      commentLoadingById: { ...state.commentLoadingById, [verdictId]: true },
    }));
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (cursor) params.set("cursor", cursor);
      params.set("verdictId", verdictId);
      const response = await apiFetch<{
        ok: boolean;
        comments: VerdictCommentDTO[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(`/api/verdicts/comments?${params.toString()}`, {
        method: "GET",
        skipCsrf: true,
      } as RequestInit & { skipCsrf?: boolean });
      set((state) => ({
        commentsByVerdictId: {
          ...state.commentsByVerdictId,
          [verdictId]: append
            ? [
                ...(state.commentsByVerdictId[verdictId] || []),
                ...response.comments,
              ]
            : response.comments,
        },
        commentCursorByVerdictId: {
          ...state.commentCursorByVerdictId,
          [verdictId]: response.nextCursor,
        },
        commentsHasMoreByVerdictId: {
          ...state.commentsHasMoreByVerdictId,
          [verdictId]: response.hasMore,
        },
      }));
    } finally {
      set((state) => ({
        commentLoadingById: { ...state.commentLoadingById, [verdictId]: false },
      }));
    }
  },

  addComment: async (verdictId, text, parentId = null) => {
    const response = await apiFetch<{
      ok: boolean;
      comment: VerdictCommentDTO;
      comments_count: number;
    }>("/api/verdicts/comments", {
      method: "POST",
      body: JSON.stringify({ verdict_id: verdictId, text, parent_id: parentId }),
    });

    set((state) => ({
      commentsByVerdictId: {
        ...state.commentsByVerdictId,
        [verdictId]: [
          ...(state.commentsByVerdictId[verdictId] || []),
          response.comment,
        ],
      },
      friends: updateVerdict(state.friends, verdictId, (item) => ({
        ...item,
        comments_count: response.comments_count,
      })),
      topics: updateVerdict(state.topics, verdictId, (item) => ({
        ...item,
        comments_count: response.comments_count,
      })),
    }));
  },
}));
