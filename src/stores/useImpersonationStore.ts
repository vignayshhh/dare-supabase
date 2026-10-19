// Impersonation Event store.
// Holds only the lightweight cross-screen state: which session (if any) the
// full-screen chat overlay should show, plus the live list of the user's
// sessions used to render special chat-list cards. The chat screen itself owns
// its own real-time subscriptions (session / secret / messages / prompts).

import { create } from "zustand";
import {
  impersonationService,
  type ImpersonationSession,
} from "@/middleware/services/impersonation.service";

let mySessionsUserId: string | null = null;
let mySessionsUnsubscribe: (() => void) | null = null;

interface ImpersonationStore {
  // The session id the full-screen chat overlay should display (null = closed).
  openViewSessionId: string | null;
  // Live sessions where the current user is the impersonated person or target.
  mySessions: ImpersonationSession[];

  openSession: (sessionId: string) => void;
  closeSession: () => void;
  subscribeMySessions: (userId: string) => () => void;
}

export const useImpersonationStore = create<ImpersonationStore>((set) => ({
  openViewSessionId: null,
  mySessions: [],

  openSession: (sessionId: string) => set({ openViewSessionId: sessionId }),
  closeSession: () => set({ openViewSessionId: null }),

  subscribeMySessions: (userId: string) => {
    if (!userId) return () => {};
    // Reuse an existing listener for the same user.
    if (mySessionsUserId === userId && mySessionsUnsubscribe) {
      return mySessionsUnsubscribe;
    }
    if (mySessionsUnsubscribe) {
      mySessionsUnsubscribe();
      mySessionsUnsubscribe = null;
    }

    mySessionsUserId = userId;
    const unsubscribe = impersonationService.subscribeToSessionsForUser(
      userId,
      (sessions) => set({ mySessions: sessions }),
    );

    mySessionsUnsubscribe = () => {
      unsubscribe();
      if (mySessionsUserId === userId) {
        mySessionsUserId = null;
        mySessionsUnsubscribe = null;
      }
    };
    return mySessionsUnsubscribe;
  },
}));
