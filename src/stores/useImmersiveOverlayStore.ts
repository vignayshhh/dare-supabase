// Immersive Overlay Store — global flag for full-screen overlays (e.g.
// Friendship Court) that must hide the bottom navigation. Screen layers use
// CSS `contain`, so a deeply-mounted overlay cannot out-z-index the sibling
// nav layer; this store lets AuthenticatedApp drop the nav instead.

import { create } from "zustand";

interface ImmersiveOverlayState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useImmersiveOverlayStore = create<ImmersiveOverlayState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
