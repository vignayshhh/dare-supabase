import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AppAppearanceTheme = "dark-premium" | "pop-social";

interface AppearanceStore {
  theme: AppAppearanceTheme;
  setTheme: (theme: AppAppearanceTheme) => void;
  toggleTheme: () => void;
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      theme: "dark-premium",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({
          theme:
            state.theme === "pop-social" ? "dark-premium" : "pop-social",
        })),
    }),
    {
      name: "dare-appearance-theme",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
