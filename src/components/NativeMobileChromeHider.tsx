"use client";

import { useEffect } from "react";

function isStandaloneDisplayMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isNativeMobileViewport() {
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 900px)").matches
  );
}

export default function NativeMobileChromeHider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!isNativeMobileViewport() || isStandaloneDisplayMode()) return;

    let cancelled = false;

    const requestMobileFullscreen = async () => {
      if (cancelled || document.fullscreenElement) return;

      const element = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };

      try {
        if (element.requestFullscreen) {
          await element.requestFullscreen({ navigationUI: "hide" });
          return;
        }

        await element.webkitRequestFullscreen?.();
      } catch {
        // Browsers that do not allow fullscreen for normal pages should fail quietly.
      }
    };

    const interactionEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "touchstart",
      "click",
    ];

    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, requestMobileFullscreen, {
        passive: true,
        once: true,
      });
    });

    return () => {
      cancelled = true;
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, requestMobileFullscreen);
      });
    };
  }, []);

  return null;
}
