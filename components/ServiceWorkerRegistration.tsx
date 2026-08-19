"use client";

import { useEffect } from "react";
import { isSimpleCityProductionHost } from "@/lib/serviceWorker";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (!isSimpleCityProductionHost(window.location.hostname)) return;

    const cancel =
      "requestIdleCallback" in window
        ? (id: number) => window.cancelIdleCallback(id)
        : (id: number) => window.clearTimeout(id);

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    let scheduledId: number | null = null;
    const clearScheduledRegistration = () => {
      if (scheduledId === null) return;
      cancel(scheduledId);
      scheduledId = null;
    };

    const scheduleRegistration = () => {
      clearScheduledRegistration();
      if ("requestIdleCallback" in window) {
        scheduledId = window.requestIdleCallback(registerServiceWorker, { timeout: 4000 });
        return;
      }

      scheduledId = window.setTimeout(registerServiceWorker, 250);
    };

    if (document.readyState === "complete") {
      scheduleRegistration();
      return () => clearScheduledRegistration();
    }

    window.addEventListener("load", scheduleRegistration, { once: true });

    return () => {
      window.removeEventListener("load", scheduleRegistration);
      clearScheduledRegistration();
    };
  }, []);

  return null;
}
