export type PointFeature<P> = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: P;
};

export type FeatureCollection<P> = { type: "FeatureCollection"; features: PointFeature<P>[] };

export type IncidentProps = {
  id: string;
  disasterType: string;
  title: string | null;
  severity: number;
  state: string;
  source: "CITIZEN" | "OFFICIAL";
  confidenceScore: number;
  radiusMeters: number;
  externalUrl: string | null;
  reportCount: number;
  peopleInDanger: number;
  createdAt: string;
};

export type MapData = {
  incidents: FeatureCollection<IncidentProps>;
};

/** "3 min ago" / "2 h ago" — short enough for a map popup. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}
