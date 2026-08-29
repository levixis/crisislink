/**
 * Canonical SQL fragments for the PostGIS expression indexes created in
 * prisma/migrations/*_postgis. Postgres only uses an expression index when the
 * query repeats the expression exactly, so every geospatial query builds its
 * predicate from these constants rather than writing the expression out again.
 */

/** Geography point for a row in "Report". */
export const REPORT_POINT = `ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography`;

/** Geography point for a row in "Incident". */
export const INCIDENT_POINT = `ST_SetSRID(ST_MakePoint("centerLng", "centerLat"), 4326)::geography`;

/** Geography point for a row in "PushSubscription". */
export const SUBSCRIPTION_POINT = `ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography`;

/** Geography point for a row in "Resource". */
export const RESOURCE_POINT = `ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography`;

/** Geography point for a row in "Shelter". */
export const SHELTER_POINT = `ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography`;

/**
 * Geography point built from bound parameters. Pass lng then lat — PostGIS,
 * like GeoJSON, takes longitude first.
 */
export const paramPoint = (lngParam: string, latParam: string) =>
  `ST_SetSRID(ST_MakePoint(${lngParam}, ${latParam}), 4326)::geography`;
