/**
 * Step 2 of the verification pipeline: does this report belong to something we
 * already know about?
 *
 * The rule is deliberately simple and fixed: same disaster type, within
 * CLUSTER_RADIUS_METERS of an open incident's centre, and that incident has
 * seen activity within CLUSTER_TIME_WINDOW. A dynamic radius that adapts to
 * event type would be defensible, but it is not what makes this project
 * interesting and it would be much harder to explain and to test.
 *
 * The spatial predicate is PostGIS `ST_DWithin` over the GiST expression index
 * from the postgis migration, and the nearest match wins via the `<->` KNN
 * distance operator. The index is only used if the indexed expression is
 * repeated exactly, which is why it is built from the shared constants in
 * src/lib/geo-sql.ts rather than written out here.
 */
import type { DisasterType } from "@/generated/prisma/enums";
import type { IncidentModel } from "@/generated/prisma/models";
import { centroid, haversineMeters } from "@/lib/geo";
import { INCIDENT_POINT, paramPoint } from "@/lib/geo-sql";
import { prisma } from "@/lib/prisma";
import { OFFICIALLY_COVERED_TYPES, type ClusterReport } from "@/lib/verification/confidence";

/** Reports within this distance of an open incident join it. */
export const CLUSTER_RADIUS_METERS = 1_000;

/** An incident stops accepting new reports once it has been quiet this long. */
export const CLUSTER_TIME_WINDOW_MS = 2 * 60 * 60 * 1_000;

/** Floor for a cluster's displayed radius, so a single report is not a dot. */
export const MIN_INCIDENT_RADIUS_METERS = 300;

/**
 * How far an official hazard event may be from a cluster and still corroborate
 * it. Earthquake records carry their own felt radius, which is what actually
 * gets used; this is the fallback ceiling.
 */
export const CORROBORATION_MAX_RADIUS_METERS = 400_000;

/** How far apart in time an official event and a cluster may be. */
export const CORROBORATION_TIME_WINDOW_MS = 6 * 60 * 60 * 1_000;

export type ReportPoint = {
  id: string;
  disasterType: DisasterType;
  lat: number;
  lng: number;
  createdAt: Date;
};

/**
 * Nearest open citizen incident of the same type within the clustering radius
 * and time window, or null.
 *
 * Only CITIZEN-sourced incidents are candidates: a citizen report must never
 * be absorbed into an official feed record, because that would let crowd data
 * silently alter something an agency published.
 */
export async function findMatchingIncident(report: ReportPoint): Promise<string | null> {
  const windowStart = new Date(report.createdAt.getTime() - CLUSTER_TIME_WINDOW_MS);
  const point = paramPoint("$3::float8", "$4::float8");

  // All values are bound parameters; only our own constants are interpolated.
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id"
       FROM "Incident"
      WHERE "disasterType" = $1::"DisasterType"
        AND "source" = 'CITIZEN'
        AND "state" <> 'RESOLVED'
        AND "updatedAt" >= $2
        AND ST_DWithin(${INCIDENT_POINT}, ${point}, $5::float8)
      ORDER BY ${INCIDENT_POINT} <-> ${point}
      LIMIT 1`,
    report.disasterType,
    windowStart,
    report.lng,
    report.lat,
    CLUSTER_RADIUS_METERS,
  );

  return rows[0]?.id ?? null;
}

/**
 * Recomputes a cluster's centre and radius from its member reports. The centre
 * is the mean of the members and the radius covers the furthest one, so the
 * circle drawn on the map is the area reports actually came from rather than a
 * fixed ring around whoever happened to report first.
 */
export function recomputeGeometry(reports: { lat: number; lng: number }[]) {
  const center = centroid(reports);
  const furthest = reports.reduce((max, r) => Math.max(max, haversineMeters(center, r)), 0);
  return {
    centerLat: center.lat,
    centerLng: center.lng,
    radiusMeters: Math.max(MIN_INCIDENT_RADIUS_METERS, Math.round(furthest)),
  };
}

/**
 * Does an official-feed incident back this cluster up?
 *
 * Returns `null` — not `false` — when no feed covers this disaster type, so
 * the scorer can drop the component instead of penalising the cluster for a
 * gap in our data sources. See the availability note in confidence.ts.
 *
 * A match means the cluster centre falls inside the official event's own
 * radius (a M6 quake is felt for 200 km, so proximity is measured against the
 * event's footprint, not a fixed distance) and the two are close in time.
 */
export async function findOfficialCorroboration(params: {
  disasterType: DisasterType;
  lat: number;
  lng: number;
  at: Date;
}): Promise<boolean | null> {
  if (!OFFICIALLY_COVERED_TYPES.has(params.disasterType)) return null;

  const point = paramPoint("$2::float8", "$3::float8");
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id"
       FROM "Incident"
      WHERE "disasterType" = $1::"DisasterType"
        AND "source" = 'OFFICIAL'
        AND "createdAt" BETWEEN $4 AND $5
        AND ST_DWithin(
              ${INCIDENT_POINT},
              ${point},
              LEAST("radiusMeters", $6::float8)
            )
      LIMIT 1`,
    params.disasterType,
    params.lng,
    params.lat,
    new Date(params.at.getTime() - CORROBORATION_TIME_WINDOW_MS),
    new Date(params.at.getTime() + CORROBORATION_TIME_WINDOW_MS),
    CORROBORATION_MAX_RADIUS_METERS,
  );

  return rows.length > 0;
}

/** Member reports of an incident, in the shape the scorer wants. */
export async function loadClusterReports(
  incidentId: string,
): Promise<(ClusterReport & { aiConfidence: number | null })[]> {
  const links = await prisma.incidentReport.findMany({
    where: { incidentId },
    select: {
      report: {
        select: {
          id: true,
          userId: true,
          severity: true,
          lat: true,
          lng: true,
          createdAt: true,
          aiConfidence: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return links.map((l) => l.report);
}

export type IncidentSummary = Pick<
  IncidentModel,
  "id" | "state" | "confidenceScore" | "severity" | "centerLat" | "centerLng" | "radiusMeters"
>;
