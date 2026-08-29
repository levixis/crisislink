import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  incidentId: z.string().min(1).nullable(),
});

/** Assign a resource to an incident, or release it back to the pool. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["ADMIN", "RESPONDER"]);
    const { id } = await params;
    const { incidentId } = schema.parse(await request.json());

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) return jsonError("Resource not found", 404);

    if (incidentId) {
      const incident = await prisma.incident.findUnique({
        where: { id: incidentId },
        select: { id: true, state: true },
      });
      if (!incident) return jsonError("Incident not found", 404);
      if (incident.state === "RESOLVED") {
        return jsonError("That incident is already resolved", 409);
      }
      if (resource.assignedIncidentId && resource.assignedIncidentId !== incidentId) {
        return jsonError("This resource is already committed elsewhere", 409);
      }
    }

    const updated = await prisma.resource.update({
      where: { id },
      data: incidentId
        ? { assignedIncidentId: incidentId, assignedAt: new Date(), status: "ASSIGNED" }
        : { assignedIncidentId: null, assignedAt: null, status: "AVAILABLE" },
      select: { id: true, status: true, assignedIncidentId: true },
    });

    await recordAudit({
      actorId: user.id,
      action: incidentId ? "resource.assign" : "resource.release",
      targetType: "Resource",
      targetId: id,
      metadata: { incidentId, label: resource.label },
    });

    return NextResponse.json({ resource: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
