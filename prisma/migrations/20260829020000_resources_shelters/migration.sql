-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('AMBULANCE', 'RESCUE_TEAM', 'BOAT', 'FIRE_ENGINE', 'MEDICAL_SUPPLIES', 'FOOD_WATER', 'HEAVY_EQUIPMENT');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'DEPLOYED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToId" TEXT;

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "ResourceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assignedIncidentId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shelter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL,
    "currentOccupancy" INTEGER NOT NULL DEFAULT 0,
    "contact" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shelter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_status_type_idx" ON "Resource"("status", "type");

-- CreateIndex
CREATE INDEX "Resource_assignedIncidentId_idx" ON "Resource"("assignedIncidentId");

-- CreateIndex
CREATE INDEX "Shelter_isOpen_idx" ON "Shelter"("isOpen");

-- CreateIndex
CREATE INDEX "Incident_assignedToId_state_idx" ON "Incident"("assignedToId", "state");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_assignedIncidentId_fkey" FOREIGN KEY ("assignedIncidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same expression-index approach as the other geography columns: responders
-- ask "what is near this incident", which is a spatial query over both tables.
-- Expressions must match RESOURCE_POINT / SHELTER_POINT in src/lib/geo-sql.ts.
CREATE INDEX "Resource_geography_idx"
  ON "Resource"
  USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography));

CREATE INDEX "Shelter_geography_idx"
  ON "Shelter"
  USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography));
