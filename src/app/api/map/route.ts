import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { DEFAULT_WINDOW_HOURS, getMapData } from "@/lib/map-data";

export const dynamic = "force-dynamic";

/** Public map data, polled by the client for updates. */
export async function GET(request: Request) {
  try {
    const requested = Number(new URL(request.url).searchParams.get("hours") ?? DEFAULT_WINDOW_HOURS);
    const hours = Math.min(Number.isFinite(requested) ? requested : DEFAULT_WINDOW_HOURS, 24 * 30);
    return NextResponse.json(await getMapData(hours));
  } catch (error) {
    return handleRouteError(error);
  }
}
