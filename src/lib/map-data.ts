import "server-only";
import { HAZARD_BOUNDS } from "@/lib/india";
import type { FeatureCollection, IncidentProps, MapData } from "@/lib/map-types";
import { prisma } from "@/lib/prisma";

export const DEFAULT_WINDOW_HOURS = 24 * 7;
const MAX_FEATURES = 500;

/**
 * Everything the public map draws.
 *
 * Incidents, not raw reports. From Phase 2 every accepted report is clustered
 * into an incident, so the incident is the meaningful unit — and publishing
 * clusters rather than individual pins also stops the public map from being a
 * map of exactly where each reporter was standing.
 */
export async function getMapData(hours: number = DEFAULT_WINDOW_HOURS): Promise<MapData> {
  const since = new Date(Date.now() - hours * 3_600_000);

  const incidents = await prisma.incident.findMany({
    where: {
      createdAt: { gte: since },
      state: { not: "RESOLVED" },
      // Belt and braces: ingest and report intake already enforce the service
      // area, so this only guards against rows predating a bounds change.
      centerLat: { gte: HAZARD_BOUNDS.south, lte: HAZARD_BOUNDS.north },
      centerLng: { gte: HAZARD_BOUNDS.west, lte: HAZARD_BOUNDS.east },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_FEATURES,
    select: {
      id: true,
      disasterType: true,
      title: true,
      severity: true,
      state: true,
      source: true,
      confidenceScore: true,
      radiusMeters: true,
      centerLat: true,
      centerLng: true,
      externalUrl: true,
      createdAt: true,
      _count: { select: { reportLinks: true } },
      reportLinks: { select: { report: { select: { peopleInDanger: true } } } },
    },
  });

  const features: FeatureCollection<IncidentProps> = {
    type: "FeatureCollection",
    features: incidents.map((i) => ({
      type: "Feature" as const,
      // GeoJSON is [longitude, latitude].
      geometry: { type: "Point" as const, coordinates: [i.centerLng, i.centerLat] as [number, number] },
      properties: {
        id: i.id,
        disasterType: i.disasterType,
        title: i.title,
        severity: i.severity,
        state: i.state,
        source: i.source,
        confidenceScore: i.confidenceScore,
        radiusMeters: i.radiusMeters,
        externalUrl: i.externalUrl,
        reportCount: i._count.reportLinks,
        peopleInDanger: i.reportLinks.reduce((sum, l) => sum + l.report.peopleInDanger, 0),
        createdAt: i.createdAt.toISOString(),
      },
    })),
  };

  return { incidents: features };
}
