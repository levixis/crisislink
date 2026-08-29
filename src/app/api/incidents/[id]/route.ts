import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { DISASTER_LABELS, SEVERITY_LABELS, type DisasterTypeValue } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { findSubscribersInRadius, sendAlert } from "@/lib/push";
import { explainIncident } from "@/lib/verification/pipeline";
import { checkHumanTransition, HUMAN_ACTIONS, HUMAN_ACTION_TARGETS } from "@/lib/verification/state";

export const dynamic = "force-dynamic";

/**
 * The text that lands on someone's lock screen. Kept short, factual and
 * actionable: no exclamation marks, no urgency theatre — the notification
 * arriving at all is the signal.
 */
function buildAlertMessage(incident: {
  disasterType: string;
  title: string | null;
  severity: number;
  radiusMeters: number;
}) {
  const type = DISASTER_LABELS[incident.disasterType as DisasterTypeValue] ?? "Incident";
  const km = (incident.radiusMeters / 1000).toFixed(1);
  return {
    title: `${type} alert near you`,
    body: `${incident.title ?? type} — ${SEVERITY_LABELS[incident.severity] ?? "reported"}. Affected area about ${km} km. Open CrisisLink for details.`,
  };
}

const actionSchema = z.object({
  action: z.enum(HUMAN_ACTIONS),
  note: z.string().trim().max(500).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(["ADMIN", "RESPONDER"]);
    const { id } = await params;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        verifier: { select: { name: true } },
        reportLinks: {
          orderBy: { createdAt: "asc" },
          include: { report: { include: { user: { select: { name: true } } } } },
        },
      },
    });
    if (!incident) return jsonError("Incident not found", 404);

    const [confidence, audit] = await Promise.all([
      explainIncident(id),
      prisma.auditLog.findMany({
        where: { targetType: "Incident", targetId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      }),
    ]);

    return NextResponse.json({ incident, confidence, audit });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * The human decision endpoint.
 *
 * This is the ONLY path to ACTIVE — the state that alerts people in range.
 * It requires an authenticated ADMIN or RESPONDER, and every call is written
 * to the audit log with the actor's id, whether or not it succeeds in
 * changing anything.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["ADMIN", "RESPONDER"]);
    const { id } = await params;
    const { action, note } = actionSchema.parse(await request.json());

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        state: true,
        confidenceScore: true,
        verifiedBy: true,
        disasterType: true,
        title: true,
        severity: true,
        centerLat: true,
        centerLng: true,
        radiusMeters: true,
      },
    });
    if (!incident) return jsonError("Incident not found", 404);

    const check = checkHumanTransition(incident.state, action, incident.verifiedBy !== null);
    if (!check.allowed) return jsonError(check.reason, 409);

    const target = HUMAN_ACTION_TARGETS[action];
    const now = new Date();

    const updated = await prisma.incident.update({
      where: { id },
      data: {
        state: target,
        verifiedBy: user.id,
        verifiedAt: now,
        ...(target === "RESOLVED" ? { resolvedAt: now } : {}),
      },
      select: { id: true, state: true, confidenceScore: true },
    });

    // Rejecting says the reports were not describing a real incident, so the
    // reports themselves are marked rejected and drop off the public map.
    if (action === "reject") {
      const links = await prisma.incidentReport.findMany({
        where: { incidentId: id },
        select: { reportId: true },
      });
      await prisma.report.updateMany({
        where: { id: { in: links.map((l) => l.reportId) } },
        data: { status: "REJECTED" },
      });
    }

    // ACTIVATE is the only action that reaches the public. Everything above
    // this point is bookkeeping; this is the part that makes phones buzz, and
    // it happens only because a named human asked for it.
    let delivery: Awaited<ReturnType<typeof sendAlert>> | null = null;
    if (action === "activate") {
      const message = buildAlertMessage(incident);
      const targets = await findSubscribersInRadius({
        lat: incident.centerLat,
        lng: incident.centerLng,
        radiusMeters: incident.radiusMeters,
      });

      delivery = await sendAlert(
        {
          incidentId: incident.id,
          title: message.title,
          body: message.body,
          severity: incident.severity,
        },
        targets,
      );

      await prisma.alert.create({
        data: {
          incidentId: incident.id,
          message: `${message.title} — ${message.body}`,
          radiusMeters: incident.radiusMeters,
          recipientCount: delivery.recipients,
          deliveredCount: delivery.delivered,
          createdBy: user.id,
        },
      });
    }

    await recordAudit({
      actorId: user.id,
      action: `incident.${action}`,
      targetType: "Incident",
      targetId: id,
      metadata: {
        from: incident.state,
        to: target,
        scoreAtDecision: incident.confidenceScore,
        ...(note ? { note } : {}),
        ...(delivery ? { alertDelivery: delivery } : {}),
      },
    });

    return NextResponse.json({ incident: updated, delivery });
  } catch (error) {
    return handleRouteError(error);
  }
}
