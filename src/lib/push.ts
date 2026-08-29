import "server-only";
import webpush from "web-push";
import { SUBSCRIPTION_POINT, paramPoint } from "@/lib/geo-sql";
import { prisma } from "@/lib/prisma";

/**
 * Web Push delivery.
 *
 * Runs entirely on free infrastructure: VAPID keys are generated locally and
 * the actual delivery goes to whichever push service the browser chose
 * (Google, Mozilla, Apple). There is no third-party service to sign up for and
 * nothing to pay.
 *
 * This module is only ever reached from a human ACTIVATE decision. Nothing
 * automatic may call it — see src/lib/verification/state.ts.
 */

let configured = false;

/** Returns false when VAPID is not configured, so callers can skip cleanly. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@crisislink.local",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export type AlertPayload = {
  incidentId: string;
  title: string;
  body: string;
  severity: number;
};

type Target = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Subscriptions whose stored location falls inside the incident radius.
 *
 * Uses ST_DWithin against the partial GiST index from the push migration. The
 * radius comes from the incident itself, so the alert footprint is the same
 * circle the map draws — people are told about what they can see.
 */
export async function findSubscribersInRadius(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
}): Promise<Target[]> {
  const point = paramPoint("$1::float8", "$2::float8");
  return prisma.$queryRawUnsafe<Target[]>(
    `SELECT "id", "endpoint", "p256dh", "auth"
       FROM "PushSubscription"
      WHERE "lat" IS NOT NULL
        AND "lng" IS NOT NULL
        AND ST_DWithin(${SUBSCRIPTION_POINT}, ${point}, $3::float8)`,
    params.lng,
    params.lat,
    params.radiusMeters,
  );
}

export type DeliveryResult = { recipients: number; delivered: number; pruned: number };

/**
 * Sends one alert to every subscriber in range.
 *
 * Failures are expected and handled rather than thrown: browsers expire push
 * subscriptions routinely. A 404 or 410 means the subscription is permanently
 * gone and is deleted; anything else is counted and left alone, because a
 * transient push-service error must not destroy a working registration.
 */
export async function sendAlert(
  payload: AlertPayload,
  targets: Target[],
): Promise<DeliveryResult> {
  if (!ensureConfigured()) {
    console.warn("[crisislink] VAPID not configured — alert not sent");
    return { recipients: targets.length, delivered: 0, pruned: 0 };
  }

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let delivered = 0;

  const results = await Promise.allSettled(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          body,
          { TTL: 3600, urgency: "high" },
        );
        delivered += 1;
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(t.id);
        else console.error("[crisislink] push failed", status, cause);
        throw cause;
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  const sentIds = targets.filter((t) => !dead.includes(t.id)).map((t) => t.id);
  if (sentIds.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: sentIds } },
      data: { lastSentAt: new Date() },
    });
  }

  void results;
  return { recipients: targets.length, delivered, pruned: dead.length };
}
