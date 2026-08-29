"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Opt-in control for geofenced alerts.
 *
 * Asks for two permissions in a deliberate order: notifications first, then
 * location. If someone declines location we still keep the subscription —
 * they just will not receive geofenced alerts — rather than throwing the
 * registration away, because they may grant it later.
 */

type State = "checking" | "unsupported" | "idle" | "working" | "subscribed" | "denied" | "error";

/**
 * The VAPID public key must reach `applicationServerKey` as a Uint8Array
 * backed by a real ArrayBuffer — `Uint8Array.from` widens to ArrayBufferLike,
 * which the DOM types reject.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Resolves to null rather than rejecting — location is optional here. */
function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

export default function PushOptIn() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);

  // Every branch resolves through the promise chain rather than setting state
  // in the effect body, which keeps this off the cascading-render path. The
  // support checks cannot run during render either: this component is
  // server-rendered first, where `Notification` does not exist.
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(async (): Promise<State> => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
        if (Notification.permission === "denied") return "denied";
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        return subscription ? "subscribed" : "idle";
      })
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState("idle");
      });
    return () => {
      active = false;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setState("working");
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      // ServiceWorkerRegistrar already registered it on load; `ready` resolves
      // with that registration rather than creating a second one.
      const registration = await navigator.serviceWorker.ready;

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Alerts are not configured on this server.");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const position = await currentPosition();
      const json = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          lat: position?.coords.latitude ?? null,
          lng: position?.coords.longitude ?? null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not register for alerts.");

      setState("subscribed");
      setMessage(
        body.geofenced
          ? null
          : "Registered, but without a location we cannot send alerts for your area. Allow location and try again.",
      );
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : "Could not register for alerts.");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("idle");
      setMessage(null);
    } catch {
      setState("error");
      setMessage("Could not turn alerts off.");
    }
  }, []);

  if (state === "checking" || state === "unsupported") return null;

  return (
    <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-2 text-xs shadow ring-1 ring-slate-200">
      {state === "subscribed" ? (
        <div className="flex items-center gap-2">
          <span className="font-medium text-green-700">🔔 Alerts on</span>
          <button type="button" onClick={unsubscribe} className="text-slate-500 underline">
            Turn off
          </button>
        </div>
      ) : state === "denied" ? (
        <p className="max-w-[13rem] text-slate-600">
          Notifications are blocked for this site. Enable them in your browser settings to get
          alerts for your area.
        </p>
      ) : (
        <button
          type="button"
          disabled={state === "working"}
          onClick={subscribe}
          className="font-semibold text-red-700 underline disabled:opacity-50"
        >
          {state === "working" ? "Setting up…" : "🔔 Alert me about my area"}
        </button>
      )}
      {message ? <p className="mt-1 max-w-[13rem] text-amber-700">{message}</p> : null}
    </div>
  );
}
