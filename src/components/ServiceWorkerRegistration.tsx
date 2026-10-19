"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      if ("caches" in window) {
        void caches.keys().then((cacheNames) => {
          cacheNames
            .filter((cacheName) => cacheName.startsWith("dare-pwa-"))
            .forEach((cacheName) => {
              void caches.delete(cacheName);
            });
        });
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.info("SW registered: ", registration);
          void registration.update();
        })
        .catch((registrationError) => {
          console.info("SW registration failed: ", registrationError);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);

    return () => {
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
