import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Incident queue for the dashboard: worst and least certain first. */
export async function GET(request: Request) {
  try {
    await requireUser(["ADMIN", "RESPONDER"]);
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const state = url.searchParams.get("state");

    const incidents = await prisma.incident.findMany({
      where: {
        ...(source === "CITIZEN" || source === "OFFICIAL" ? { source } : {}),
        ...(state ? { state: state as never } : {}),
      },
      orderBy: [{ state: "asc" }, { confidenceScore: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        _count: { select: { reportLinks: true } },
        verifier: { select: { name: true } },
      },
    });

    return NextResponse.json({ incidents });
  } catch (error) {
    return handleRouteError(error);
  }
}
