"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on load.
 *
 * Installability — and therefore the Android TWA built from it — requires a
 * registered service worker, so this cannot wait until someone opts into push
 * notifications. PushOptIn reuses whatever registration this created.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((cause) => {
      console.warn("[crisislink] service worker registration failed:", cause);
    });
  }, []);
  return null;
}
