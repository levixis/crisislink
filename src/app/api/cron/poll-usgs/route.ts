import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api";
import { getCronSecret } from "@/lib/env";
import { pollUsgs } from "@/lib/feeds/usgs";

// Always hits the live feed; never prerendered or cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Triggered by Vercel Cron (see vercel.json) or by hand during development.
 * When CRON_SECRET is set, callers must present it as a bearer token — Vercel
 * Cron sends exactly that header.
 */
export async function GET(request: Request) {
  try {
    const secret = getCronSecret();
    if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
      return jsonError("Unauthorized", 401);
    }

    const started = Date.now();
    const result = await pollUsgs();
    return NextResponse.json({ ...result, tookMs: Date.now() - started });
  } catch (error) {
    return handleRouteError(error);
  }
}
