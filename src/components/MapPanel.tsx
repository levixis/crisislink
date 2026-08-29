"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatIst } from "@/lib/india";
import PushOptIn from "@/components/PushOptIn";
import LocationPrompt, { type LocationState } from "@/components/LocationPrompt";
import { OFFICIAL_COLOR, STATE_COLORS } from "@/lib/constants";
import type { MapScope } from "@/components/MapView";
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
  scope,
}: {
  initialData: MapData;
  signedIn: boolean;
  scope: MapScope;
}) {
  const [data, setData] = useState<MapData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // What the map is ACTUALLY showing, which is not always what was asked for:
  // a local scope falls back to the national frame when location is refused,
  // and the legend must not claim "your area" while showing the whole country.
  const [framed, setFramed] = useState<"local" | "national">("national");
  const [locationState, setLocationState] = useState<LocationState>("pending");
  // Incremented by "Try again" so the framing effect re-runs its request.
  const [attempt, setAttempt] = useState(0);

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
      <MapView
        data={data}
        scope={scope}
        attempt={attempt}
        onFramed={setFramed}
        onLocation={setLocationState}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="pointer-events-auto max-w-[15rem] rounded-lg bg-white/95 p-3 text-xs shadow ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">
            {framed === "local" ? "Your area" : "India"} · last 7 days
          </p>

          {/* Two separate channels, said out loud. Colour was doing double duty
              and nobody could tell an instrument reading from a crowd
              consensus. */}
          <p className="mt-2 font-medium text-slate-500">
            Citizen reports — colour is confidence
          </p>
          <ul className="mt-1 space-y-1 text-slate-600">
            {[
              ["UNVERIFIED", "Unverified"],
              ["SUSPECTED", "Suspected"],
              ["HIGH_CONFIDENCE", "High confidence"],
              ["VERIFIED", "Verified"],
            ].map(([key, label]) => (
              <li key={key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: STATE_COLORS[key] }}
                />
                {label}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-slate-400"
                style={{ backgroundColor: STATE_COLORS.ACTIVE }}
              />
              <span className="font-medium text-red-800">Alert issued</span>
            </li>
          </ul>

          <p className="mt-2.5 font-medium text-slate-500">Official feeds</p>
          <ul className="mt-1 space-y-1 text-slate-600">
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: OFFICIAL_COLOR }}
              />
              USGS seismic ({officialCount})
            </li>
          </ul>

          <p className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
            {citizenCount} citizen · {officialCount} official
            {activeCount > 0 ? (
              <span className="block font-semibold text-red-700">
                {activeCount} active alert{activeCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>
          {error ? <p className="mt-1 text-red-700">{error}</p> : null}
          {updatedAt && !error ? (
            <p className="mt-1 text-slate-400">Updated {formatIst(updatedAt)} IST</p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <LocationPrompt state={locationState} onRetry={() => setAttempt((n) => n + 1)} />
          {signedIn ? <PushOptIn /> : null}
        </div>
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
