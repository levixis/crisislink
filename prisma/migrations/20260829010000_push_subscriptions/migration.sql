-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deliveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recipientCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added, same reasoning as the other geography indexes: alerting asks
-- "which subscribers are inside this incident's radius", which is a spatial
-- query over PushSubscription. Partial index because a subscription without a
-- location can never match a geofence, so it has no business in the index.
-- The expression must match src/lib/geo-sql.ts SUBSCRIPTION_POINT exactly.
CREATE INDEX "PushSubscription_geography_idx"
  ON "PushSubscription"
  USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography))
  WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL;
