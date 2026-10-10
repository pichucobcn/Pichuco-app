import type { AnnouncementLevel } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { assertCan, can, NotFoundError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";
import { notify } from "./notifications";

export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(4000),
  level: z.enum(["URGENTE", "IMPORTANTE", "GENERAL", "INFORMATIVO"]).default("GENERAL"),
});

export const LEVEL_LABEL: Record<AnnouncementLevel, string> = {
  URGENTE: "Urgente",
  IMPORTANTE: "Importante",
  GENERAL: "General",
  INFORMATIVO: "Informativo",
};

export async function listAnnouncements(actor: Actor, limit = 30) {
  assertCan(actor, "comunicados_ver");
  const seeReaders = can(actor, "comunicados_crear");
  const [items, team] = await Promise.all([
    db.announcement.findMany({
      include: { author: { select: { shortName: true } }, reads: { include: { user: { select: { id: true, shortName: true } } } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.user.count({ where: { active: true } }),
  ]);
  return items.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    level: a.level,
    author: a.author.shortName,
    createdAt: a.createdAt,
    createdByAi: a.createdByAi,
    readByMe: a.reads.some((r) => r.userId === actor.id),
    readCount: a.reads.length,
    teamSize: team,
    // Quién lo leyó sólo lo ven quienes pueden publicar comunicados.
    readers: seeReaders ? a.reads.map((r) => ({ name: r.user.shortName, at: r.readAt })) : undefined,
  }));
}

export async function unreadAnnouncements(actor: Actor) {
  if (!can(actor, "comunicados_ver")) return 0;
  return db.announcement.count({ where: { reads: { none: { userId: actor.id } } } });
}

export async function createAnnouncement(actor: Actor, raw: z.input<typeof announcementSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "comunicados_crear", "Sólo los responsables pueden publicar comunicados.");
  const input = announcementSchema.parse(raw);
  const a = await db.announcement.create({
    data: { ...input, authorId: actor.id, createdByAi: !!ctx.viaAi, reads: { create: { userId: actor.id } } },
  });
  await audit(actor, "announcement.create", `Comunicado (${LEVEL_LABEL[a.level]}): ${a.title}`, ctx, { announcementId: a.id });
  const team = await db.user.findMany({ where: { active: true, NOT: { id: actor.id } } });
  await notify(team.map((u) => u.id), `Comunicado ${LEVEL_LABEL[a.level].toLowerCase()}`, a.title, "/comunicados");
  return a;
}

export async function markAnnouncementRead(actor: Actor, id: string) {
  assertCan(actor, "comunicados_ver");
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a) throw new NotFoundError("Comunicado no encontrado.");
  await db.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: actor.id } },
    create: { announcementId: id, userId: actor.id },
    update: {},
  });
}
