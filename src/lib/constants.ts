// Plain string unions mirroring the Prisma enums. Kept separate so client
// components can import labels without pulling the Prisma runtime into the
// browser bundle.

export const DISASTER_TYPES = [
  "FLOOD",
  "FIRE",
  "EARTHQUAKE",
  "STORM",
  "LANDSLIDE",
  "BUILDING_COLLAPSE",
  "ROAD_ACCIDENT",
  "OTHER",
] as const;

export type DisasterTypeValue = (typeof DISASTER_TYPES)[number];

export const DISASTER_LABELS: Record<DisasterTypeValue, string> = {
  FLOOD: "Flood",
  FIRE: "Fire",
  EARTHQUAKE: "Earthquake",
  STORM: "Storm / cyclone",
  LANDSLIDE: "Landslide",
  BUILDING_COLLAPSE: "Building collapse",
  ROAD_ACCIDENT: "Road accident",
  OTHER: "Other",
};

export const DISASTER_EMOJI: Record<DisasterTypeValue, string> = {
  FLOOD: "🌊",
  FIRE: "🔥",
  EARTHQUAKE: "🫨",
  STORM: "🌀",
  LANDSLIDE: "⛰️",
  BUILDING_COLLAPSE: "🏚️",
  ROAD_ACCIDENT: "🚧",
  OTHER: "⚠️",
};

export const HELP_OPTIONS = [
  "Medical",
  "Rescue",
  "Food & water",
  "Shelter",
  "Evacuation",
  "Power / communications",
] as const;

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Minor",
  2: "Moderate",
  3: "Serious",
  4: "Severe",
  5: "Catastrophic",
};

export const INCIDENT_STATES = [
  "UNVERIFIED",
  "SUSPECTED",
  "HIGH_CONFIDENCE",
  "VERIFIED",
  "ACTIVE",
  "RESOLVED",
] as const;

/**
 * Colour encodes HOW CONFIDENT we are in a CITIZEN cluster — the confidence
 * ladder, cold to hot.
 */
export const STATE_COLORS: Record<string, string> = {
  UNVERIFIED: "#94a3b8",
  SUSPECTED: "#f59e0b",
  HIGH_CONFIDENCE: "#f97316",
  VERIFIED: "#dc2626",
  ACTIVE: "#b91c1c",
  RESOLVED: "#16a34a",
};

/**
 * Official-feed events get their own colour, off the ladder entirely.
 *
 * They are stored as VERIFIED because a seismic network is authoritative for
 * "did the ground shake" — but painting them with the ladder's red made red
 * mean three unrelated things at once: an instrument measurement, a crowd
 * consensus, and a human-issued alert. A viewer could not tell which kind of
 * trust they were looking at, which is the one thing this map exists to show.
 *
 * Blue reads as information rather than alarm, which is exactly right: an
 * official event is a fact on record, not a call to act. Red is now reserved
 * for the crowd ladder's top, and ACTIVE is separated further by a halo.
 */
export const OFFICIAL_COLOR = "#1d4ed8";
