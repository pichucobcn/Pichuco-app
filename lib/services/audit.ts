import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { can } from "../permissions";
import type { Actor, ActionContext } from "./context";

export async function audit(
  actor: Actor,
  action: string,
  summary: string,
  ctx: ActionContext = {},
  data?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: { actorId: actor.id, viaAi: !!ctx.viaAi, action, summary, input: ctx.input, data },
  });
}

/** Historial de acciones. Los jefes ven todo; el resto, sólo lo propio. */
export async function listAudit(actor: Actor, limit = 50) {
  return db.auditLog.findMany({
    where: can(actor, "auditoria") ? {} : { actorId: actor.id },
    include: { actor: { select: { shortName: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
