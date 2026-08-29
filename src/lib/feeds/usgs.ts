/**
 * USGS earthquake ingester, scoped to the India hazard region.
 *
 * Uses the FDSN event query API rather than the worldwide summary GeoJSON,
 * because it accepts a bounding box server-side:
 *   https://earthquake.usgs.gov/fdsnws/event/1/
 * That means we fetch tens of relevant events instead of thousands of global
 * ones and discarding 98% of them locally.
 *
 * The box is HAZARD_BOUNDS, which extends past India's border — a quake in
 * Nepal or the Hindu Kush is felt in Indian districts, and clipping to the
 * border would drop the events that matter most in the north.
 *
 * Events land as `source: OFFICIAL` incidents in state VERIFIED — a seismic
 * network is authoritative for "did the ground shake", so there is nothing for
 * the crowd-verification pipeline to establish. They are NOT set to ACTIVE:
 * that transition sends real alerts to real people and stays human-only, no
 * matter how trustworthy the source. See the state machine module.
 */
import { HAZARD_BOUNDS } from "@/lib/india";
import { prisma } from "@/lib/prisma";

const FDSN_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";

/**
 * Below this magnitude an event is a seismograph reading rather than an
 * incident anyone experiences, and ingesting it just buries real events on the
 * map. M2.5 is the threshold USGS itself uses for its "widely felt" summaries.
 */
const MIN_MAGNITUDE = 2.5;

/** How far back each poll looks. Comfortably longer than the cron interval, so
 *  a missed run is caught up rather than leaving a hole. */
const LOOKBACK_HOURS = 24 * 7;

type UsgsFeature = {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number | null;
    title: string | null;
    url: string | null;
    type: string | null;
  };
  geometry: { type: string; coordinates: [number, number, number?] } | null;
};

/**
 * Magnitude → our 1-5 severity scale, following the coarse bands of the
 * Modified Mercalli intensity people actually experience.
 */
export function magnitudeToSeverity(mag: number): number {
  if (mag >= 7.0) return 5;
  if (mag >= 6.0) return 4;
  if (mag >= 4.5) return 3;
  if (mag >= 3.0) return 2;
  return 1;
}

/**
 * Rough radius of perceptible shaking. Felt-area grows sharply with magnitude,
 * so this is a documented step table rather than a fitted attenuation model —
 * honest about being an approximation for map display, not a hazard product.
 */
export function magnitudeToRadiusMeters(mag: number): number {
  if (mag >= 7.0) return 400_000;
  if (mag >= 6.0) return 200_000;
  if (mag >= 4.5) return 75_000;
  if (mag >= 3.0) return 25_000;
  return 5_000;
}

export function buildFeedUrl(now: Date = new Date()): string {
  const params = new URLSearchParams({
    format: "geojson",
    starttime: new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000).toISOString(),
    minlatitude: String(HAZARD_BOUNDS.south),
    maxlatitude: String(HAZARD_BOUNDS.north),
    minlongitude: String(HAZARD_BOUNDS.west),
    maxlongitude: String(HAZARD_BOUNDS.east),
    minmagnitude: String(MIN_MAGNITUDE),
    orderby: "time",
    limit: "500",
  });
  return `${FDSN_ENDPOINT}?${params}`;
}

export type IngestResult = { fetched: number; created: number; updated: number; skipped: number };

export async function pollUsgs(now: Date = new Date()): Promise<IngestResult> {
  const response = await fetch(buildFeedUrl(now), {
    headers: { Accept: "application/geo+json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`USGS feed returned ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { features?: UsgsFeature[] };
  const features = body.features ?? [];
  const result: IngestResult = { fetched: features.length, created: 0, updated: 0, skipped: 0 };

  for (const feature of features) {
    const { mag, place, time, title, url, type } = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;

    // GeoJSON is [longitude, latitude] — the reverse of how we store it.
    if (!coords || mag == null || mag < MIN_MAGNITUDE || type !== "earthquake") {
      result.skipped += 1;
      continue;
    }
    const [lng, lat] = coords;

    const externalId = `usgs:${feature.id}`;
    const data = {
      disasterType: "EARTHQUAKE" as const,
      title: title ?? place ?? `M ${mag} earthquake`,
      centerLat: lat,
      centerLng: lng,
      radiusMeters: magnitudeToRadiusMeters(mag),
      severity: magnitudeToSeverity(mag),
      // An instrument reading is its own evidence: full confidence, and the
      // score is not produced by the citizen-report formula.
      confidenceScore: 1,
      source: "OFFICIAL" as const,
      externalUrl: url ?? null,
    };

    const existing = await prisma.incident.findUnique({
      where: { externalId },
      select: { id: true },
    });

    if (existing) {
      // USGS revises magnitude and location as more stations report in.
      await prisma.incident.update({ where: { externalId }, data });
      result.updated += 1;
    } else {
      await prisma.incident.create({
        data: {
          ...data,
          externalId,
          state: "VERIFIED",
          verifiedAt: new Date(),
          createdAt: time ? new Date(time) : new Date(),
        },
      });
      result.created += 1;
    }
  }

  return result;
}
