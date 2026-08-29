import { after, NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isReportable } from "@/lib/india";
import { prisma } from "@/lib/prisma";
import { reportSchema } from "@/lib/validation";
import { classifyAndRescore, processReport } from "@/lib/verification/pipeline";
import { checkReportSanity } from "@/lib/verification/sanity";

/** Citizen report intake. Phase 2 will hand the saved report to the clusterer. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = reportSchema.parse(await request.json());

    // CrisisLink only serves India: there are no responders anywhere else, so
    // an out-of-area coordinate is a spoof or a mis-parsed value, not a report
    // we could ever act on.
    if (!isReportable(input)) {
      return jsonError(
        "CrisisLink currently covers India only, and this location falls outside it. Check your GPS or the coordinates you entered.",
        422,
      );
    }

    // Idempotency, before anything else has a side effect. A replayed offline
    // report must be a no-op, not a second witness — and this also absorbs
    // double-taps and multi-tab retries.
    if (input.clientId) {
      const existing = await prisma.report.findUnique({
        where: { clientId: input.clientId },
        select: { id: true, createdAt: true, status: true },
      });
      if (existing) {
        return NextResponse.json({ report: existing, incident: null, deduplicated: true });
      }
    }

    const sanity = await checkReportSanity(user.id, input);
    if (!sanity.ok) return jsonError(sanity.reason, sanity.status);

    const report = await prisma.report.create({
      data: {
        userId: user.id,
        clientId: input.clientId ?? null,
        disasterType: input.disasterType,
        severity: input.severity,
        description: input.description,
        peopleInDanger: input.peopleInDanger,
        helpNeeded: input.helpNeeded,
        mediaUrls: input.mediaUrls,
        lat: input.lat,
        lng: input.lng,
        accuracy: input.accuracy ?? null,
      },
    });

    // The report is already saved. If clustering or scoring fails we still
    // return 201: a report that reached us must never be lost because a
    // downstream step broke, and it can be re-clustered later. The reporter
    // is not the right person to surface an internal failure to.
    let pipeline = null;
    try {
      pipeline = await processReport(report);
    } catch (cause) {
      console.error("[crisislink] verification pipeline failed for report", report.id, cause);
    }

    // Text classification takes seconds, so it runs after this response is
    // sent rather than making the reporter wait. The cluster is rescored when
    // it lands; the score in the response below is the pre-classification one.
    if (pipeline) {
      const incidentId = pipeline.incidentId;
      after(() => classifyAndRescore(report, incidentId));
    }

    return NextResponse.json(
      {
        report: { id: report.id, createdAt: report.createdAt, status: report.status },
        incident: pipeline
          ? {
              id: pipeline.incidentId,
              state: pipeline.state,
              isNew: pipeline.createdIncident,
              confidenceScore: pipeline.confidence.score,
              reportCount: pipeline.reportCount,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Signed-in users see their own reports; admins and responders see all. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const privileged = user.role === "ADMIN" || user.role === "RESPONDER";

    const reports = await prisma.report.findMany({
      where: privileged ? {} : { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    return handleRouteError(error);
  }
}
