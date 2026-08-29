/* CrisisLink service worker — push alerts only.
 *
 * Deliberately minimal: it does not cache or intercept fetches. Caching an
 * emergency map risks showing someone a stale incident, which is worse than
 * showing them nothing. Offline report queueing (Phase 3) will add a narrow,
 * explicit handler here rather than a blanket cache.
 */

self.addEventListener("install", () => self.skipWaiting());

/*
 * Pass-through fetch handler — required for installability, deliberately not a
 * cache.
 *
 * Chrome will not treat a site as installable without a service worker that
 * handles fetch, and the Android TWA is built from that installable PWA. But
 * caching an emergency map is actively harmful: a responder shown a cached
 * incident list has no way to know it is stale. So this handler exists to
 * satisfy the requirement and does nothing else. Offline report queueing will
 * add a narrow, explicit handler for POSTs to /api/reports only — never a
 * blanket cache of application data.
 */
self.addEventListener("fetch", () => {
  // Intentionally empty: no respondWith, so the browser handles it normally.
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || "Emergency alert";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Severe alerts stay on screen until acknowledged.
      requireInteraction: (payload.severity ?? 0) >= 4,
      vibrate: [200, 100, 200],
      // Collapses repeat alerts for the same incident instead of stacking.
      tag: payload.incidentId ? `incident-${payload.incidentId}` : undefined,
      renotify: true,
      data: { incidentId: payload.incidentId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
