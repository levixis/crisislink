"use client";

import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import {
  DISASTER_EMOJI,
  DISASTER_LABELS,
  OFFICIAL_COLOR,
  SEVERITY_LABELS,
  STATE_COLORS,
} from "@/lib/constants";
import type { DisasterTypeValue } from "@/lib/constants";
import {
  HAZARD_BOUNDS,
  INITIAL_VIEW_BOUNDS,
  LOCAL_VIEW_RADIUS_KM,
  toLeafletBounds,
} from "@/lib/india";
import type { LocationState } from "@/components/LocationPrompt";
import { type MapData, timeAgo } from "@/lib/map-types";

const label = (type: string) => DISASTER_LABELS[type as DisasterTypeValue] ?? type;
const emoji = (type: string) => DISASTER_EMOJI[type as DisasterTypeValue] ?? "⚠️";

const STATE_LABELS: Record<string, string> = {
  UNVERIFIED: "Unverified",
  SUSPECTED: "Suspected",
  HIGH_CONFIDENCE: "High confidence",
  VERIFIED: "Verified",
  ACTIVE: "Active — alert issued",
  RESOLVED: "Resolved",
};

/**
 * VISUAL ENCODING — every channel below is read straight off what the scoring
 * engine produces, so styling cannot drift from the data behind it.
 *
 *   channel          driven by            meaning
 *   ---------------  -------------------  ------------------------------------
 *   colour           incident.state       where it sits in the state machine
 *                                         (STATE_COLORS: grey unverified,
 *                                         amber suspected, orange high-conf,
 *                                         red verified/active, green resolved)
 *   outline dashes   incident.state       dashed while still gathering
 *                                         evidence (unverified / suspected)
 *   centre size      incident.severity    how bad, 1-5
 *   ring size        incident.radiusMeters the actual affected footprint
 *   fill + stroke    severity AND         how loudly it should read
 *   intensity        confidenceScore
 *
 * The last row is the point of the whole platform: calibrated alarm, not
 * blanket alarm. A confidently-scored severe incident is the only thing that
 * renders at full weight. Because official-feed incidents all carry
 * state=VERIFIED and confidence=1, severity is what separates them from each
 * other — without it an M2.5 tremor and an M6.5 would look identical.
 */
const severityRadius = (severity: number) => 5 + severity * 1.6;

/** Ring fill: 0.06 (faint) to ~0.34 (solid) as severity and confidence rise. */
const areaFillOpacity = (severity: number, confidence: number) =>
  0.06 + (severity / 5) * 0.18 + confidence * 0.1;

/** Outline thickness, so severe incidents hold their edge when zoomed out. */
const areaStrokeWeight = (severity: number) => 0.75 + (severity / 5) * 1.75;

const MAX_BOUNDS = toLeafletBounds(HAZARD_BOUNDS);
const INITIAL_BOUNDS = toLeafletBounds(INITIAL_VIEW_BOUNDS);

export type MapScope = "national" | "responder" | "citizen";

/**
 * Frames the opening view.
 *
 * National scope fits India by viewport rather than a fixed zoom, so a phone
 * and a desktop both open on the country instead of one opening on half of
 * Asia. Local scopes centre on the viewer and fall back to the national frame
 * when location is unavailable — a citizen must never be left staring at a
 * blank ocean because they declined a permission.
 */
function InitialFraming({
  scope,
  attempt,
  onFramed,
  onLocation,
}: {
  scope: MapScope;
  /** Bumped by the "Try again" button to re-run the location request. */
  attempt: number;
  onFramed: (framed: "local" | "national") => void;
  onLocation: (state: LocationState) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (scope === "national") {
      map.fitBounds(INITIAL_BOUNDS, { animate: false, padding: [12, 12] });
      onFramed("national");
      onLocation("granted"); // national scope never asks, so nothing to report
      return;
    }

    if (!("geolocation" in navigator)) {
      map.fitBounds(INITIAL_BOUNDS, { animate: false, padding: [12, 12] });
      onFramed("national");
      onLocation("unsupported");
      return;
    }

    // Show the national frame immediately, then tighten if location arrives.
    map.fitBounds(INITIAL_BOUNDS, { animate: false, padding: [12, 12] });
    onFramed("national");

    let active = true;
    const radiusKm =
      scope === "responder" ? LOCAL_VIEW_RADIUS_KM.RESPONDER : LOCAL_VIEW_RADIUS_KM.CITIZEN;

    onLocation("pending");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        map.fitBounds(
          [
            [position.coords.latitude - radiusKm / 111, position.coords.longitude - radiusKm / 100],
            [position.coords.latitude + radiusKm / 111, position.coords.longitude + radiusKm / 100],
          ],
          { animate: false, padding: [12, 12] },
        );
        onFramed("local");
        onLocation("granted");
      },
      (error) => {
        if (!active) return;
        // The national frame already drawn stands; say why it is showing.
        onLocation(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );

    return () => {
      active = false;
    };
  }, [map, scope, attempt, onFramed, onLocation]);

  return null;
}

export default function MapView({
  data,
  scope,
  attempt,
  onFramed,
  onLocation,
}: {
  data: MapData;
  scope: MapScope;
  attempt: number;
  onFramed: (framed: "local" | "national") => void;
  onLocation: (state: LocationState) => void;
}) {
  return (
    <MapContainer
      bounds={INITIAL_BOUNDS}
      minZoom={4}
      // Fractional zoom, so fitBounds can frame India snugly instead of
      // rounding down to the next whole zoom level and overshooting.
      zoomSnap={0.25}
      maxBounds={MAX_BOUNDS}
      // 1.0 makes the boundary solid rather than elastic, so a pan simply stops.
      maxBoundsViscosity={1}
      scrollWheelZoom
      // Absolutely positioned inside MapPanel's `relative` box: Leaflet measures
      // its container at init, and a percentage height would resolve against a
      // flex parent whose own height is not definite, leaving the map at 0 px.
      className="absolute inset-0"
    >
      <InitialFraming
        scope={scope}
        attempt={attempt}
        onFramed={onFramed}
        onLocation={onLocation}
      />

      {/* Muted basemap in two layers.
          Standard OSM tiles carry dense road classes and place names that, at
          country zoom over India, compete with the incident markers for
          attention. Esri's Light Gray is a keyless, deliberately desaturated
          alternative, and it splits terrain from labels — so we keep the
          place names a responder needs while dropping the road clutter.
          (CARTO Positron was the obvious pick but now serves
          "API KEY REQUIRED" watermarked tiles to unauthenticated callers.)
          Note the {z}/{y}/{x} order: Esri reverses y and x. */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
        maxZoom={16}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />

      {data.incidents.features.map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const official = p.source === "OFFICIAL";
        // Source first: an instrument measurement is a different kind of claim
        // from a crowd consensus and must not borrow its colour.
        const color = official ? OFFICIAL_COLOR : (STATE_COLORS[p.state] ?? "#64748b");
        const gathering = !official && (p.state === "UNVERIFIED" || p.state === "SUSPECTED");
        const alerting = p.state === "ACTIVE";

        return (
          <div key={p.id}>
            <Circle
              center={[lat, lng]}
              radius={p.radiusMeters}
              pathOptions={{
                color,
                weight: areaStrokeWeight(p.severity),
                fillColor: color,
                fillOpacity: areaFillOpacity(p.severity, p.confidenceScore),
                dashArray: gathering ? "4 4" : undefined,
              }}
            />
            {/* An issued alert gets a white halo underneath, so "a person
                decided to warn people here" is legible at a glance and cannot
                be confused with a merely well-scored cluster. */}
            {alerting ? (
              <CircleMarker
                center={[lat, lng]}
                radius={severityRadius(p.severity) + 6}
                pathOptions={{ color: "#ffffff", weight: 3, fillOpacity: 0 }}
              />
            ) : null}
            <CircleMarker
              center={[lat, lng]}
              radius={severityRadius(p.severity)}
              pathOptions={{
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.55 + (p.severity / 5) * 0.35,
                dashArray: gathering ? "3 3" : undefined,
              }}
            >
              <Popup>
                <div className="max-w-[17rem] space-y-1 text-sm">
                  <p className="font-semibold">
                    {emoji(p.disasterType)} {p.title ?? label(p.disasterType)}
                  </p>
                  <p className="text-slate-600">
                    {STATE_LABELS[p.state] ?? p.state} · {SEVERITY_LABELS[p.severity] ?? p.severity}
                    {" · "}
                    {timeAgo(p.createdAt)}
                  </p>
                  <p className="text-slate-600">
                    {official
                      ? "Official feed"
                      : `${p.reportCount} citizen report${p.reportCount === 1 ? "" : "s"} · ${Math.round(
                          p.confidenceScore * 100,
                        )}% confidence`}
                  </p>
                  {p.peopleInDanger > 0 ? (
                    <p className="font-medium text-red-700">
                      {p.peopleInDanger} people reported in danger
                    </p>
                  ) : null}
                  {p.externalUrl ? (
                    <a
                      className="text-blue-700 underline"
                      href={p.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View source record
                    </a>
                  ) : null}
                  {!official && p.state !== "ACTIVE" ? (
                    <p className="text-xs text-slate-500">
                      Not an official alert. Confirmed by a person only once marked active.
                    </p>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          </div>
        );
      })}
    </MapContainer>
  );
}
