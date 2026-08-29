/**
 * CrisisLink is deployed for India, so two different geographic limits apply.
 *
 * They are deliberately different sizes, and it matters why:
 *
 *  - REPORTING_BOUNDS is where a citizen report is accepted. A report from
 *    outside it is almost certainly a spoofed or mis-parsed coordinate, since
 *    the platform has no responders anywhere else.
 *
 *  - HAZARD_BOUNDS is where an official hazard event is worth ingesting, and
 *    it is wider on purpose: a M7 in Nepal, the Hindu Kush, or the Bay of
 *    Bengal shakes or floods Indian districts even though its epicentre is not
 *    in India. Clipping official feeds to the political border would drop
 *    exactly the events that matter most on the northern and eastern edges.
 *
 * Both are axis-aligned boxes, not the political border. A box is a coarse
 * service-area filter — it admits slivers of neighbouring countries and the
 * surrounding sea — and it is not, and must not be presented as, a statement
 * about where any border lies. A real border polygon is future work.
 */

export type Bounds = { south: number; north: number; west: number; east: number };

/**
 * Mainland India plus the Andaman & Nicobar Islands (east to ~94°E, south to
 * ~6.7°N) and Lakshadweep (west to ~71.7°E), with a small margin.
 */
export const REPORTING_BOUNDS: Bounds = {
  south: 6.4,
  north: 37.6,
  west: 67.9,
  east: 97.5,
};

/** Reporting box plus roughly 300 km of buffer for cross-border hazards. */
export const HAZARD_BOUNDS: Bounds = {
  south: 5.0,
  north: 40.0,
  west: 65.0,
  east: 100.0,
};

/**
 * The opening camera framing — India itself, nothing more.
 *
 * Deliberately a THIRD box, distinct from both of the above. HAZARD_BOUNDS is
 * a data decision (which events are worth ingesting) and doubles as the pan
 * limit, so users can still scroll out to a quake in Nepal. But framing the
 * opening view to the ingest buffer would put a third of the screen over the
 * Arabian Sea and western China on first paint. What gets ingested and what
 * gets shown first are separate questions and should not share a constant.
 */
export const INITIAL_VIEW_BOUNDS: Bounds = {
  south: 7.5,
  north: 35.5,
  west: 68.5,
  east: 89.5,
};

/**
 * How far around themselves each role sees by default.
 *
 * A citizen asking "is my street flooding" and a duty officer asking "what is
 * happening across the country" are different questions, and opening both on
 * the same national view answers neither. Citizens and responders open on
 * their own surroundings; only an operations view starts national. Everyone
 * can still pan and zoom out to HAZARD_BOUNDS — this sets the opening frame,
 * not a restriction.
 */
export const LOCAL_VIEW_RADIUS_KM = {
  /** Roughly a city and its outskirts. */
  CITIZEN: 25,
  /** Wider, because a responder covers a district rather than a street. */
  RESPONDER: 60,
} as const;

/** Distance within which the landing page counts an incident as "near you". */
export const NEARBY_RADIUS_KM = 25;

export const IST_TIME_ZONE = "Asia/Kolkata";

export function isWithin(bounds: Bounds, point: { lat: number; lng: number }): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

export const isReportable = (point: { lat: number; lng: number }) =>
  isWithin(REPORTING_BOUNDS, point);

export const isMonitoredHazard = (point: { lat: number; lng: number }) =>
  isWithin(HAZARD_BOUNDS, point);

/** Leaflet wants [[south, west], [north, east]]. */
export const toLeafletBounds = (bounds: Bounds): [[number, number], [number, number]] => [
  [bounds.south, bounds.west],
  [bounds.north, bounds.east],
];

/** Clock times are always shown in IST, whatever the viewer's device is set to. */
export function formatIst(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatIstDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(typeof value === "string" ? new Date(value) : value);
}
