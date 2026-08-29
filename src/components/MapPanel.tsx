"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatIst } from "@/lib/india";
import PushOptIn from "@/components/PushOptIn";
import type { MapData } from "@/lib/map-types";

// Leaflet touches `window` at import time, so the map never renders on the server.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-blue-50 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

const REFRESH_MS = 60_000;

export default function MapPanel({
  initialData,
  signedIn,
}: {
  initialData: MapData;
  signedIn: boolean;
}) {
  const [data, setData] = useState<MapData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/map", { cache: "no-store" });
      if (!response.ok) throw new Error(`Map data unavailable (${response.status})`);
      setData((await response.json()) as MapData);
      setUpdatedAt(new Date());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Map data unavailable");
    }
  }, []);

  // The first payload is server-rendered, so this only schedules refreshes —
  // no fetch-on-mount, and the map has pins in the very first paint.
  useEffect(() => {
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const features = data.incidents.features;
  const citizenCount = features.filter((f) => f.properties.source === "CITIZEN").length;
  const officialCount = features.length - citizenCount;
  const activeCount = features.filter((f) => f.properties.state === "ACTIVE").length;

  return (
    <div className="relative flex-1 min-h-0">
      <MapView data={data} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-2 text-xs shadow ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">India · last 7 days</p>
          <p className="mt-1 flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
            {citizenCount} citizen incident{citizenCount === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
            {officialCount} official incident{officialCount === 1 ? "" : "s"}
          </p>
          {activeCount > 0 ? (
            <p className="mt-0.5 font-semibold text-red-700">
              {activeCount} active alert{activeCount === 1 ? "" : "s"}
            </p>
          ) : null}
          {error ? <p className="mt-1 text-red-700">{error}</p> : null}
          {updatedAt && !error ? (
            <p className="mt-1 text-slate-400">Updated {formatIst(updatedAt)} IST</p>
          ) : null}
        </div>

        {signedIn ? <PushOptIn /> : null}
      </div>

      {/* pb-9 keeps the button clear of Leaflet's attribution control, which
          has to stay legible to satisfy the OpenStreetMap licence. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center p-4 pb-9">
        <Link
          href="/report"
          className="pointer-events-auto rounded-full bg-red-700 px-6 py-3 text-base font-semibold text-white shadow-lg ring-1 ring-red-800 transition hover:bg-red-800 active:scale-95"
        >
          Report an incident
        </Link>
      </div>
    </div>
  );
}
