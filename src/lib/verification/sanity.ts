/**
 * Step 1 of the verification pipeline (see the build spec, §5): cheap,
 * explainable guards applied at ingest, before a report is allowed anywhere
 * near the clustering and confidence logic.
 *
 * Deliberately boring. Both checks are things a human reviewer would also
 * catch, which is what makes them defensible: nothing here is a black box.
 */
import { haversineMeters } from "@/lib/geo";
import { prisma } from "@/lib/prisma";

/** Max reports one account may file in the window below. */
export const RATE_LIMIT_COUNT = 5;
export const RATE_LIMIT_WINDOW_MINUTES = 10;

/**
 * Fastest plausible ground speed between two consecutive reports by the same
 * user, in metres/second. ~280 m/s is roughly airliner cruise speed: generous
 * on purpose, so this only ever fires on genuinely impossible jumps (a user
 * reporting from Delhi and Mumbai 30 seconds apart) rather than on someone
 * legitimately reporting from a moving vehicle.
 */
export const MAX_PLAUSIBLE_SPEED_MPS = 280;

/** A jump shorter than this is never rejected, whatever the timestamps say. */
const GPS_JUMP_GRACE_METERS = 2_000;

export type SanityResult = { ok: true } | { ok: false; reason: string; status: number };

export async function checkReportSanity(
  userId: string,
  point: { lat: number; lng: number },
  now: Date = new Date(),
): Promise<SanityResult> {
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60_000);

  const [recentCount, lastReport] = await Promise.all([
    prisma.report.count({ where: { userId, createdAt: { gte: windowStart } } }),
    prisma.report.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { lat: true, lng: true, createdAt: true },
    }),
  ]);

  if (recentCount >= RATE_LIMIT_COUNT) {
    return {
      ok: false,
      status: 429,
      reason: `You can file at most ${RATE_LIMIT_COUNT} reports every ${RATE_LIMIT_WINDOW_MINUTES} minutes. If this is a fast-moving emergency, add detail to your existing report instead.`,
    };
  }

  if (lastReport) {
    const meters = haversineMeters(point, lastReport);
    const seconds = Math.max(1, (now.getTime() - lastReport.createdAt.getTime()) / 1000);
    if (meters > GPS_JUMP_GRACE_METERS && meters / seconds > MAX_PLAUSIBLE_SPEED_MPS) {
      return {
        ok: false,
        status: 422,
        reason:
          "This location is impossibly far from your previous report for the time elapsed. Check your GPS and try again.",
      };
    }
  }

  return { ok: true };
}
