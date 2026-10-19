"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useAppearanceStore } from "@/stores/useAppearanceStore";

function applyTheme(theme: string) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.dareTheme = theme === "pop-social" ? "pop-social" : "dark";
  root.style.colorScheme = theme === "pop-social" ? "light" : "dark";

  let themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.appendChild(themeColor);
  }
  themeColor.content = theme === "pop-social" ? "#fff8ef" : "#030403";
}

export function AppearanceThemeRuntime() {
  const theme = useAppearanceStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const unsub = useAppearanceStore.persist.onFinishHydration((state) => {
      applyTheme(state.theme);
    });
    applyTheme(useAppearanceStore.getState().theme);
    return unsub;
  }, []);

  return null;
}

export function AppearanceToggle() {
  const theme = useAppearanceStore((state) => state.theme);
  const toggleTheme = useAppearanceStore((state) => state.toggleTheme);
  const enabled = theme === "pop-social";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="appearance-toggle app-pressable fixed left-3 z-[10000] flex h-9 w-[64px] items-center rounded-full border p-1 backdrop-blur-2xl transition-all duration-300"
      style={{
        bottom: "calc(var(--bottom-nav-total-height) + 14px)",
      }}
      aria-label="Toggle appearance theme"
      aria-pressed={enabled}
    >
      <span
        className={`appearance-toggle-thumb flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 ${
          enabled ? "translate-x-7" : "translate-x-0"
        }`}
      >
        {enabled ? <Sun size={15} /> : <Moon size={14} />}
      </span>
    </button>
  );
}

export function AppearanceToggleInline() {
  const theme = useAppearanceStore((state) => state.theme);
  const toggleTheme = useAppearanceStore((state) => state.toggleTheme);
  const enabled = theme === "pop-social";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="appearance-toggle app-pressable flex h-8 w-[56px] flex-shrink-0 items-center rounded-full border p-1 backdrop-blur-2xl transition-all duration-300"
      aria-label="Toggle appearance theme"
      aria-pressed={enabled}
    >
      <span
        className={`appearance-toggle-thumb flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
          enabled ? "translate-x-6" : "translate-x-0"
        }`}
      >
        {enabled ? <Sun size={13} /> : <Moon size={12} />}
      </span>
    </button>
  );
}
