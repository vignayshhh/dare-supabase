import { resetCircleState } from "./resetCircleState";
import { create } from "zustand";
import {
  circlesService,
  type Circle,
} from "@/middleware/services/circles.service";
import { setActiveCircleId } from "@/lib/circleContext";

type State = {
  userId: string | null;
  circles: Circle[];
  activeId: string | null;
  ready: boolean;
  error: string;
  pickerOpen: boolean;
  load: (userId: string) => Promise<void>;
  select: (id: string) => Promise<void>;
  showPicker: (open: boolean) => void;
};
export const useCirclesStore = create<State>((set, get) => ({
  userId: null,
  circles: [],
  activeId: null,
  ready: false,
  error: "",
  pickerOpen: false,
  async load(userId) {
    if (get().userId !== userId) {
      setActiveCircleId(null);
      set({ userId, circles: [], activeId: null, ready: false });
    }
    try {
      const circles = await circlesService.list();
      if (get().userId !== userId) return;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(`dare-active-circle:${userId}`);
      } catch {}
      const activeId =
        circles.find((c) => c.id === (get().activeId || saved))?.id ||
        circles[0]?.id ||
        null;
      if (get().activeId !== activeId) {
        set({ ready: false });
        await resetCircleState();
      }
      setActiveCircleId(activeId);
      set({ circles, activeId, ready: true, error: "" });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Could not load your Circles.",
        ready: false,
      });
    }
  },
  async select(id) {
    if (!get().circles.some((c) => c.id === id)) return;
    set({ ready: false });
    setActiveCircleId(null);
    await resetCircleState();
    setActiveCircleId(id);
    try {
      localStorage.setItem(`dare-active-circle:${get().userId}`, id);
    } catch {}
    set({ activeId: id, pickerOpen: false, ready: true });
  },
  showPicker: (pickerOpen) => set({ pickerOpen }),
}));
