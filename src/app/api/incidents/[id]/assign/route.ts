import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["claim", "release"]) });

/**
 * Ownership of an incident, kept separate from the state machine.
 *
 * Claiming is not a verification decision and must not look like one: it says
 * "I am dealing with this", not "this is real". Mixing the two would let
 * picking a job off the queue quietly imply confirmation.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["ADMIN", "RESPONDER"]);
    const { id } = await params;
    const { action } = schema.parse(await request.json());

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: { id: true, state: true, assignedToId: true },
    });
    if (!incident) return jsonError("Incident not found", 404);
    if (incident.state === "RESOLVED") return jsonError("This incident is already resolved", 409);

    if (action === "claim") {
      // Don't let one responder silently take over another's job.
      if (incident.assignedToId && incident.assignedToId !== user.id) {
        return jsonError("Another responder is already assigned to this incident", 409);
      }
      if (incident.assignedToId === user.id) return jsonError("You already have this incident", 409);
    } else if (incident.assignedToId !== user.id) {
      return jsonError("You are not assigned to this incident", 409);
    }

    const updated = await prisma.incident.update({
      where: { id },
      data:
        action === "claim"
          ? { assignedToId: user.id, assignedAt: new Date() }
          : { assignedToId: null, assignedAt: null },
      select: { id: true, assignedToId: true },
    });

    await recordAudit({
      actorId: user.id,
      action: `incident.${action}`,
      targetType: "Incident",
      targetId: id,
      metadata: { previousAssignee: incident.assignedToId },
    });

    return NextResponse.json({ incident: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
