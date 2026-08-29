import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Append-only trail of state changes. `actorId: null` means the change came
 * from the automatic scoring pipeline rather than a person — which is exactly
 * the distinction an evaluator (or an inquiry) would want to see.
 */
export async function recordAudit(params: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata,
    },
  });
}
