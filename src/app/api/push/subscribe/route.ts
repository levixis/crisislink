import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isReportable } from "@/lib/india";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  // Where to alert this device about. Optional: a subscription without a
  // location is kept but never matches a geofence.
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = subscribeSchema.parse(await request.json());

    // Only store a location inside the service area — an out-of-area
    // coordinate could never match an incident anyway.
    const located =
      input.lat != null && input.lng != null && isReportable({ lat: input.lat, lng: input.lng });

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        lat: located ? input.lat : null,
        lng: located ? input.lng : null,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      update: {
        userId: user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        ...(located ? { lat: input.lat, lng: input.lng } : {}),
        failureCount: 0,
      },
      select: { id: true, lat: true, lng: true },
    });

    return NextResponse.json({ subscription, geofenced: subscription.lat !== null });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const { endpoint } = z.object({ endpoint: z.url() }).parse(await request.json());
    // Scoped to the owner so one account cannot unsubscribe another's device.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
