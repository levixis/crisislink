/* CrisisLink service worker — push alerts only.
 *
 * Deliberately minimal: it does not cache or intercept fetches. Caching an
 * emergency map risks showing someone a stale incident, which is worse than
 * showing them nothing. Offline report queueing (Phase 3) will add a narrow,
 * explicit handler here rather than a blanket cache.
 */

self.addEventListener("install", () => self.skipWaiting());

/*
 * There is deliberately NO fetch handler.
 *
 * An earlier version had a no-op one to satisfy installability, but Chrome now
 * warns that a no-op fetch handler "may bring overhead during navigation" and
 * asks for it to be removed — and it no longer gates installability. Caching
 * an emergency map would be worse than useless anyway: a responder shown a
 * stale incident list has no way to know it is stale. Offline report queueing
 * will add a narrow handler for POSTs to /api/reports only.
 */

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
