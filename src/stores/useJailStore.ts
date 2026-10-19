// Circle Jail — post-court sentence state (visual layer).
// Client-side persisted state, mirroring the FriendshipCourtScreen /
// RoastJailScreen prototype precedent. Keeps the jail alive across
// navigation so it stays visible from the Events area.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type JailPrisoner = {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  colorSeed: number;
};

export type JailNote = {
  id: string;
  text: string;
  by: string;
  at: number;
  /** paper tint index for the pinned note */
  tint: number;
};

export type JailRose = {
  id: string;
  by: string;
  at: number;
};

export type JailReaction = {
  id: string;
  emoji: string;
  by: string;
  at: number;
};

export type JailEmote = {
  id: string;
  emoji: string;
  at: number;
};

export interface JailSession {
  id: string;
  prisoner: JailPrisoner;
  crime: string;
  caseLabel: string;
  startedAt: number;
  sentenceMs: number;
  released: boolean;
  notes: JailNote[];
  roses: JailRose[];
  paperBalls: number;
  hugs: number;
  barTaps: number;
  reactions: JailReaction[];
  emotes: JailEmote[];
}

export const JAIL_SENTENCE_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_JAIL_SENTENCE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

const MAX_NOTES = 40;
const MAX_REACTIONS = 30;
const MAX_EMOTES = 12;

const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function createDefaultJailSession(): JailSession {
  return {
    id: "default-vignesh-jail",
    prisoner: {
      id: "vignesh",
      name: "Vignesh",
      username: "vignesh",
      colorSeed: 1,
    },
    crime: "Ruined the Goa trip",
    caseLabel: "Court #42",
    // Keep the default scene out of the fresh-sentencing animation.
    startedAt: Date.now() - 10_000,
    sentenceMs: DEFAULT_JAIL_SENTENCE_MS,
    released: false,
    notes: [],
    roses: [],
    paperBalls: 0,
    hugs: 0,
    barTaps: 0,
    reactions: [],
    emotes: [],
  };
}

interface JailStore {
  session: JailSession | null;
  sentence: (prisoner: JailPrisoner, crime: string, caseLabel: string) => void;
  addNote: (text: string, by: string) => void;
  addRose: (by: string) => void;
  throwPaper: () => void;
  hug: () => void;
  tapBars: () => void;
  react: (emoji: string, by: string) => void;
  prisonerEmote: (emoji: string) => void;
  /** dev/testing helper — shortens the remaining sentence */
  shortenSentence: (remainingMs: number) => void;
  markReleased: () => void;
  clear: () => void;
}

function mutateSession(
  set: (fn: (state: { session: JailSession | null }) => object) => void,
  mutate: (session: JailSession) => Partial<JailSession>,
) {
  set((state) => {
    if (!state.session || state.session.released) return {};
    return { session: { ...state.session, ...mutate(state.session) } };
  });
}

export const useJailStore = create<JailStore>()(
  persist(
    (set) => ({
      session: createDefaultJailSession(),

      sentence: (prisoner, crime, caseLabel) => {
        set({
          session: {
            id: newId(),
            prisoner,
            crime,
            caseLabel,
            startedAt: Date.now(),
            sentenceMs: JAIL_SENTENCE_MS,
            released: false,
            notes: [],
            roses: [],
            paperBalls: 0,
            hugs: 0,
            barTaps: 0,
            reactions: [],
            emotes: [],
          },
        });
      },

      addNote: (text, by) =>
        mutateSession(set, (session) => ({
          notes: [
            ...session.notes,
            {
              id: newId(),
              text: text.trim().slice(0, 140),
              by,
              at: Date.now(),
              tint: session.notes.length % 5,
            },
          ].slice(-MAX_NOTES),
        })),

      addRose: (by) =>
        mutateSession(set, (session) => ({
          roses: [...session.roses, { id: newId(), by, at: Date.now() }],
        })),

      throwPaper: () =>
        mutateSession(set, (session) => ({
          paperBalls: session.paperBalls + 1,
        })),

      hug: () => mutateSession(set, (session) => ({ hugs: session.hugs + 1 })),

      tapBars: () =>
        mutateSession(set, (session) => ({ barTaps: session.barTaps + 1 })),

      react: (emoji, by) =>
        mutateSession(set, (session) => ({
          reactions: [
            ...session.reactions,
            { id: newId(), emoji, by, at: Date.now() },
          ].slice(-MAX_REACTIONS),
        })),

      prisonerEmote: (emoji) =>
        mutateSession(set, (session) => ({
          emotes: [
            ...session.emotes,
            { id: newId(), emoji, at: Date.now() },
          ].slice(-MAX_EMOTES),
        })),

      shortenSentence: (remainingMs) =>
        mutateSession(set, (session) => ({
          startedAt: Date.now() - (session.sentenceMs - remainingMs),
        })),

      markReleased: () =>
        set((state) =>
          state.session ? { session: { ...state.session, released: true } } : {},
        ),

      clear: () => set({ session: createDefaultJailSession() }),
    }),
    {
      name: "dare-circle-jail",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<JailStore>;
        return {
          ...state,
          session: state.session || createDefaultJailSession(),
        };
      },
    },
  ),
);
