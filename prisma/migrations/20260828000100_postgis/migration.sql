-- PostGIS support.
--
-- Hand-written: Prisma cannot model PostGIS types, so rather than adding a
-- `geography` column it can't see, points stay as plain lat/lng floats and we
-- index the *expression* that turns them into a geography point. Radius
-- queries then run through ST_DWithin against a GiST index, with no second
-- copy of the coordinates to keep in sync.
--
-- Queries must spell the expression exactly as written here for the planner to
-- use these indexes. The canonical form lives in src/lib/geo-sql.ts.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX "Report_geography_idx"
  ON "Report"
  USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography));

CREATE INDEX "Incident_geography_idx"
  ON "Incident"
  USING GIST ((ST_SetSRID(ST_MakePoint("centerLng", "centerLat"), 4326)::geography));
