"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { haversineMeters } from "@/lib/geo";
import { NEARBY_RADIUS_KM } from "@/lib/india";
import type { MapData } from "@/lib/map-types";

type State =
  | { kind: "locating" }
  | { kind: "nolocation" }
  | { kind: "ready"; near: number; worst: string | null };

/**
 * Answers "is anything happening near me?" in words.
 *
 * This exists because the map is empty most of the time, and an empty map is a
 * terrible answer to that question — it looks broken rather than reassuring.
 * "No incidents reported near you" is information; a blank rectangle is not.
 */
export default function NearbyStatus({ data }: { data: MapData }) {
  const [state, setState] = useState<State>({ kind: "locating" });

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(
        () =>
          new Promise<GeolocationPosition | null>((resolve) => {
            if (!("geolocation" in navigator)) return resolve(null);
            navigator.geolocation.getCurrentPosition(
              (p) => resolve(p),
              () => resolve(null),
              { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
            );
          }),
      )
      .then((position) => {
        if (!active) return;
        if (!position) return setState({ kind: "nolocation" });

        const me = { lat: position.coords.latitude, lng: position.coords.longitude };
        const near = data.incidents.features.filter((f) => {
          const [lng, lat] = f.geometry.coordinates;
          return haversineMeters(me, { lat, lng }) <= NEARBY_RADIUS_KM * 1000;
        });
        const worst = near
          .slice()
          .sort((a, b) => b.properties.severity - a.properties.severity)[0];
        setState({
          kind: "ready",
          near: near.length,
          worst: worst ? (worst.properties.title ?? worst.properties.disasterType) : null,
        });
      });
    return () => {
      active = false;
    };
  }, [data]);

  if (state.kind === "locating") {
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">
        Checking your area…
      </div>
    );
  }

  if (state.kind === "nolocation") {
    return (
      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">
          Allow location to see whether anything is happening near you.
        </p>
        <Link href="/map" className="mt-1 inline-block text-sm font-medium text-blue-700 underline">
          Or browse the map
        </Link>
      </div>
    );
  }

  const clear = state.near === 0;
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${
        clear ? "bg-green-50 ring-green-200" : "bg-red-50 ring-red-200"
      }`}
    >
      <p className={`text-base font-semibold ${clear ? "text-green-900" : "text-red-900"}`}>
        {clear
          ? "No incidents reported near you"
          : `${state.near} incident${state.near === 1 ? "" : "s"} within ${NEARBY_RADIUS_KM} km`}
      </p>
      <p className={`mt-0.5 text-sm ${clear ? "text-green-800" : "text-red-800"}`}>
        {clear
          ? `Nothing has been reported within ${NEARBY_RADIUS_KM} km in the last 7 days.`
          : (state.worst ?? "Open the map for details.")}
      </p>
      <Link
        href="/map"
        className={`mt-2 inline-block text-sm font-medium underline ${
          clear ? "text-green-900" : "text-red-900"
        }`}
      >
        Open map view
      </Link>
    </div>
  );
}
