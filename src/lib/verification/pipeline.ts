/**
 * Orchestrates the verification pipeline for one newly accepted report.
 *
 *   sanity (already done at intake)
 *     -> cluster            (cluster.ts, step 2)
 *     -> rescore            (confidence.ts, step 3)
 *     -> maybe transition   (state.ts, step 5)
 *   ...response returned to the reporter here...
 *     -> classify + rescore (classify.ts, step 4)
 *
 * Step 4 runs AFTER the response because classification takes seconds and the
 * reporter should not wait on it. It is stored on the report row, so it costs
 * one call per report rather than one per rescore, and it is optional
 * throughout: with no classifier configured the component stays unavailable
 * and the score renormalises.
 *
 * Nothing here can move an incident to ACTIVE. That is the whole point.
 */
import type { IncidentState } from "@/generated/prisma/enums";
import type { ReportModel } from "@/generated/prisma/models";
import { recordAudit } from "@/lib/audit";
import { classificationToComponentValue, classifyReport } from "@/lib/verification/classify";
import {
  CLUSTER_RADIUS_METERS,
  findMatchingIncident,
  findOfficialCorroboration,
  loadClusterReports,
  recomputeGeometry,
} from "@/lib/verification/cluster";
import { scoreCluster, type ConfidenceBreakdown } from "@/lib/verification/confidence";
import { nextAutomaticState } from "@/lib/verification/state";
import { prisma } from "@/lib/prisma";

/**
 * Cluster-level classification signal: the mean over members that were
 * actually classified. Returns null when none were, so the component drops out
 * rather than reading as a zero.
 */
function meanClassification(reports: { aiConfidence?: number | null }[]): number | null {
  const scored = reports
    .map((r) => r.aiConfidence)
    .filter((v): v is number => typeof v === "number");
  if (scored.length === 0) return null;
  return scored.reduce((a, b) => a + b, 0) / scored.length;
}

export type PipelineResult = {
  incidentId: string;
  createdIncident: boolean;
  state: string;
  confidence: ConfidenceBreakdown;
  reportCount: number;
};

/**
 * Recomputes geometry, confidence and state for one incident from its current
 * members. Shared by the intake path and the post-response classification
 * path, so both produce a score by exactly the same route.
 */
export async function rescoreIncident(
  incidentId: string,
  triggeredByReport?: string,
): Promise<{ state: IncidentState; confidence: ConfidenceBreakdown; reportCount: number }> {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: incidentId },
    select: { state: true, source: true, verifiedBy: true, disasterType: true },
  });

  const reports = await loadClusterReports(incidentId);
  const geometry = recomputeGeometry(reports);

  const corroboration = await findOfficialCorroboration({
    disasterType: incident.disasterType,
    lat: geometry.centerLat,
    lng: geometry.centerLng,
    at: reports[reports.length - 1]?.createdAt ?? new Date(),
  });

  const confidence = scoreCluster({
    disasterType: incident.disasterType,
    reports,
    center: { lat: geometry.centerLat, lng: geometry.centerLng },
    officialCorroboration: corroboration,
    llmConfidence: meanClassification(reports),
  });

  const transition = nextAutomaticState({
    current: incident.state,
    score: confidence.score,
    humanReviewed: incident.verifiedBy !== null,
    isOfficialSource: incident.source === "OFFICIAL",
  });

  // Worst-case severity across the cluster: under-stating how bad something is
  // costs more than over-stating it when a responder is choosing what to do first.
  const severity = reports.reduce((max, r) => Math.max(max, r.severity), 1);

  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      ...geometry,
      severity,
      confidenceScore: confidence.score,
      scoredAt: new Date(),
      ...(transition.changed ? { state: transition.to } : {}),
    },
  });

  if (transition.changed) {
    await recordAudit({
      actorId: null, // automatic
      action: "incident.autoTransition",
      targetType: "Incident",
      targetId: incidentId,
      metadata: {
        from: transition.from,
        to: transition.to,
        score: confidence.score,
        reason: transition.reason,
        ...(triggeredByReport ? { triggeredByReport } : {}),
      },
    });
  }

  return {
    state: transition.changed ? transition.to : incident.state,
    confidence,
    reportCount: reports.length,
  };
}

export async function processReport(report: ReportModel): Promise<PipelineResult> {
  // --- Step 2: find or create the cluster --------------------------------
  const matchId = await findMatchingIncident(report);
  let createdIncident = false;
  let incidentId: string;

  if (matchId) {
    incidentId = matchId;
  } else {
    const incident = await prisma.incident.create({
      data: {
        disasterType: report.disasterType,
        centerLat: report.lat,
        centerLng: report.lng,
        radiusMeters: CLUSTER_RADIUS_METERS,
        severity: report.severity,
        state: "UNVERIFIED",
        source: "CITIZEN",
      },
      select: { id: true },
    });
    incidentId = incident.id;
    createdIncident = true;
  }

  await prisma.incidentReport.create({ data: { incidentId, reportId: report.id } });
  await prisma.report.update({ where: { id: report.id }, data: { status: "CLUSTERED" } });

  const scored = await rescoreIncident(incidentId, report.id);

  return {
    incidentId,
    createdIncident,
    state: scored.state,
    confidence: scored.confidence,
    reportCount: scored.reportCount,
  };
}

/**
 * Step 4, run AFTER the response has been sent to the reporter.
 *
 * Classification takes roughly five seconds, and making someone wait that long
 * to hear that their emergency report was received is the wrong trade: the
 * report is already saved, clustered and scored by the time this runs. When
 * the classification lands, the cluster is rescored and may change state —
 * which is exactly what the audit trail is for.
 *
 * Safe to fail: on any error the report simply keeps a null aiConfidence and
 * the component stays unavailable.
 */
export async function classifyAndRescore(report: ReportModel, incidentId: string): Promise<void> {
  try {
    const classification = await classifyReport({
      disasterType: report.disasterType,
      description: report.description,
    });
    if (!classification) return;

    await prisma.report.update({
      where: { id: report.id },
      data: {
        aiConfidence: classificationToComponentValue(classification),
        aiMatchesType: classification.matchesClaimedType,
        aiFirsthand: classification.firsthand,
        aiSeverity: classification.estimatedSeverity,
        aiReasoning: classification.reasoning,
        aiModel: classification.model,
        aiClassifiedAt: new Date(),
      },
    });

    await rescoreIncident(incidentId, report.id);
  } catch (cause) {
    console.error("[crisislink] post-response classification failed for", report.id, cause);
  }
}



/**
 * Recomputes the confidence breakdown for an existing incident so the
 * dashboard can show *why* it scored what it scored. Deliberately recomputed
 * on read rather than stored: the breakdown is cheap, and a stored copy would
 * drift out of step with the weights whenever they are tuned.
 */
export async function explainIncident(incidentId: string): Promise<ConfidenceBreakdown | null> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { disasterType: true, centerLat: true, centerLng: true, source: true, createdAt: true },
  });
  if (!incident || incident.source === "OFFICIAL") return null;

  const reports = await loadClusterReports(incidentId);
  if (reports.length === 0) return null;

  const corroboration = await findOfficialCorroboration({
    disasterType: incident.disasterType,
    lat: incident.centerLat,
    lng: incident.centerLng,
    at: reports[reports.length - 1].createdAt,
  });

  return scoreCluster({
    disasterType: incident.disasterType,
    reports,
    center: { lat: incident.centerLat, lng: incident.centerLng },
    officialCorroboration: corroboration,
  });
}
