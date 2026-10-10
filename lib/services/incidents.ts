import type { IncidentType, User } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { hhmmToMinutes, isISODate, minutesToHHMM, relativeDay, toDbDate } from "../dates";
import { can, ForbiddenError, NotFoundError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";
import { notify } from "./notifications";
import { areaManagers, findUserByName, listTeam, shiftFor } from "./team";

export const delaySchema = z.object({
  date: z.string().refine(isISODate, "Fecha YYYY-MM-DD"),
  minutes: z.number().int().min(1).max(600),
  reason: z.string().trim().max(500).optional().nullable(),
  /** Sólo un responsable de personal puede registrar retrasos de otra persona. */
  userName: z.string().optional().nullable(),
});

export const absenceSchema = z.object({
  date: z.string().refine(isISODate, "Fecha YYYY-MM-DD"),
  reason: z.string().trim().max(500).optional().nullable(),
  userName: z.string().optional().nullable(),
});

export type Conflict = { kind: "entrega" | "reserva" | "takeaway" | "tarea" | "evento"; time: string; title: string };

async function resolveTarget(actor: Actor, userName?: string | null): Promise<User> {
  if (!userName) return actor;
  const u = await findUserByName(userName);
  if (!u) throw new NotFoundError(`No encuentro a "${userName}" en el equipo.`);
  if (u.id !== actor.id && !can(actor, "personal")) {
    throw new ForbiddenError("Sólo podés avisar de tus propios retrasos o ausencias.");
  }
  return u;
}

/** Eventos y tareas a cargo de la persona que caen antes de `untilMin` ese día. */
async function findConflicts(userId: string, date: string, untilMin: number | null): Promise<Conflict[]> {
  const d = toDbDate(date);
  const [events, tasks] = await Promise.all([
    db.agendaEvent.findMany({ where: { date: d, responsibleId: userId }, orderBy: { time: "asc" } }),
    db.task.findMany({ where: { date: d, assigneeId: userId, status: { not: "COMPLETADA" } }, orderBy: { dueTime: "asc" } }),
  ]);
  const kindMap = { ENTREGA: "entrega", RESERVA: "reserva", TAKEAWAY: "takeaway", OTRO: "evento" } as const;
  const out: Conflict[] = [];
  for (const e of events) {
    if (untilMin === null || hhmmToMinutes(e.time) < untilMin) out.push({ kind: kindMap[e.kind], time: e.time, title: e.title });
  }
  for (const t of tasks) {
    if (untilMin === null || (t.dueTime && hhmmToMinutes(t.dueTime) <= untilMin))
      out.push({ kind: "tarea", time: t.dueTime ?? "", title: t.title });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function conflictText(c: Conflict) {
  const k = { entrega: "Entrega", reserva: "Reserva", takeaway: "Pedido", tarea: "Tarea", evento: "Evento" }[c.kind];
  return `${k} ${c.time ? c.time + " — " : ""}${c.title}`;
}

async function upsertIncident(type: IncidentType, target: User, actor: Actor, date: string, minutes: number | null, reason?: string | null) {
  const existing = await db.incident.findFirst({ where: { userId: target.id, date: toDbDate(date), type } });
  const data = { minutes, reason: reason ?? null, reportedById: actor.id };
  return existing
    ? db.incident.update({ where: { id: existing.id }, data })
    : db.incident.create({ data: { ...data, type, userId: target.id, date: toDbDate(date) } });
}

/**
 * Notifica a quien corresponde: el responsable del área siempre; el jefe
 * además si hay algo afectado. El motivo (dato personal) no se reenvía.
 */
async function notifyStakeholders(target: User, title: string, body: string, conflicts: Conflict[]) {
  const managers = (await areaManagers(target.area)).filter((u) => u.id !== target.id);
  let recipients = managers;
  if (conflicts.length) {
    const jefes = (await listTeam()).filter((u) => u.role === "JEFE" && u.id !== target.id);
    recipients = [...managers, ...jefes];
  }
  if (!recipients.length) recipients = (await listTeam()).filter((u) => u.role === "JEFE" && u.id !== target.id);
  const unique = [...new Map(recipients.map((u) => [u.id, u])).values()];
  const extra = conflicts.length ? `\nAfecta a:\n${conflicts.map((c) => "• " + conflictText(c)).join("\n")}\nHay que cubrirlo.` : "";
  await notify(unique.map((u) => u.id), title, body + extra, "/agenda");
  return unique.map((u) => u.shortName);
}

export async function reportDelay(actor: Actor, raw: z.input<typeof delaySchema>, ctx: ActionContext = {}) {
  const input = delaySchema.parse(raw);
  const target = await resolveTarget(actor, input.userName);
  const shift = await shiftFor(target.id, input.date);
  const newStart = shift ? minutesToHHMM(hhmmToMinutes(shift.start) + input.minutes) : null;
  const conflicts = shift ? await findConflicts(target.id, input.date, hhmmToMinutes(newStart!)) : [];
  const incident = await upsertIncident("RETRASO", target, actor, input.date, input.minutes, input.reason);

  const day = relativeDay(input.date);
  const body = shift
    ? `${target.shortName} entra ${day} a las ${newStart} (${input.minutes} min tarde; turno ${shift.start}).`
    : `${target.shortName} avisa que ${day} llega ${input.minutes} min tarde (no tiene turno cargado).`;
  const notified = await notifyStakeholders(target, `Retraso: ${target.shortName}`, body, conflicts);

  const auditExtra = `${conflicts.length ? ` Afecta: ${conflicts.map(conflictText).join("; ")}.` : ""} Avisado: ${notified.join(", ") || "nadie"}.`;
  await audit(actor, "incident.delay", `Retraso registrado: ${body}${auditExtra}`, ctx, {
    incidentId: incident.id,
    conflicts,
    notified,
  });
  return { incident, user: target.shortName, shift: shift ? { start: shift.start, end: shift.end } : null, newStart, conflicts, notified };
}

export async function reportAbsence(actor: Actor, raw: z.input<typeof absenceSchema>, ctx: ActionContext = {}) {
  const input = absenceSchema.parse(raw);
  const target = await resolveTarget(actor, input.userName);
  const shift = await shiftFor(target.id, input.date);
  const conflicts = await findConflicts(target.id, input.date, null);
  const incident = await upsertIncident("AUSENCIA", target, actor, input.date, null, input.reason);
  const day = relativeDay(input.date);
  const body = `${target.shortName} no viene ${day}${shift ? ` (turno ${shift.start}–${shift.end})` : ""}.`;
  const notified = await notifyStakeholders(target, `Ausencia: ${target.shortName}`, body, conflicts);
  await audit(actor, "incident.absence", `Ausencia registrada: ${body}${conflicts.length ? ` Sin cubrir: ${conflicts.map(conflictText).join("; ")}.` : ""} Avisado: ${notified.join(", ") || "nadie"}.`, ctx, { incidentId: incident.id, conflicts, notified });
  return { incident, user: target.shortName, shift: shift ? { start: shift.start, end: shift.end } : null, conflicts, notified };
}

/** Incidencias del día. El motivo sólo lo ven el afectado y quien gestiona personal. */
export async function incidentsForDate(actor: Actor, date: string) {
  const list = await db.incident.findMany({ where: { date: toDbDate(date) }, include: { user: true } });
  return list.map((i) => ({
    id: i.id,
    type: i.type,
    userId: i.userId,
    user: i.user.shortName,
    minutes: i.minutes,
    reason: i.userId === actor.id || can(actor, "personal") ? i.reason : null,
  }));
}
