"use client";

import { useCallback, useEffect, useState } from "react";
import { flushQueue, listQueued } from "@/lib/offline-queue";

/**
 * Drains the offline report queue and says what it is doing.
 *
 * Runs on every page so a queued report goes out as soon as the device has
 * signal, whichever screen the person happens to be on. It is deliberately
 * visible: someone who reported during an outage needs to know whether their
 * report actually reached anyone, and silence is not an answer.
 */
export default function OfflineQueueSync() {
  const [pending, setPending] = useState(0);
  const [justSent, setJustSent] = useState(0);
  const [online, setOnline] = useState(true);

  const drain = useCallback(async () => {
    const queued = await listQueued();
    if (queued.length === 0) {
      setPending(0);
      return;
    }
    setPending(queued.length);
    if (!navigator.onLine) return;

    const result = await flushQueue();
    setPending(result.remaining);
    if (result.sent > 0) {
      setJustSent(result.sent);
      setTimeout(() => setJustSent(0), 6000);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Not called synchronously: this must not set state during the effect body.
    Promise.resolve().then(() => {
      if (!active) return;
      setOnline(navigator.onLine);
      void drain();
    });

    const onOnline = () => {
      setOnline(true);
      void drain();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [drain]);

  if (justSent > 0) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[1200] flex justify-center p-3">
        <p className="rounded-full bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {justSent} saved report{justSent === 1 ? "" : "s"} sent
        </p>
      </div>
    );
  }

  if (pending === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] flex justify-center p-3">
      <p className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-lg">
        {pending} report{pending === 1 ? "" : "s"} waiting to send
        {online ? " — sending…" : " — you are offline"}
      </p>
    </div>
  );
}
