import type { Area, Prisma, Priority, TaskKind, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { fromDbDate, isHHMM, isISODate, relativeDay, toDbDate } from "../dates";
import { can, ForbiddenError, NotFoundError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";
import { notify } from "./notifications";
import { findUserByName } from "./team";

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  kind: z.enum(["GENERAL", "PRODUCCION", "LIMPIEZA", "MANTENIMIENTO", "ADMINISTRATIVA"]).default("GENERAL"),
  area: z.enum(["COCINA", "SALA", "ADMIN", "GENERAL"]).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  /** Nombre de la persona (lo usa Pichuco AI); se resuelve a assigneeId. */
  assigneeName: z.string().optional().nullable(),
  date: z.string().refine(isISODate, "Fecha YYYY-MM-DD").optional().nullable(),
  dueTime: z.string().refine(isHHMM, "Hora HH:MM").optional().nullable(),
  priority: z.enum(["BAJA", "MEDIA", "ALTA"]).default("MEDIA"),
  quantity: z.number().positive().optional().nullable(),
  unit: z.string().max(30).optional().nullable(),
});
export type TaskInput = z.input<typeof taskInputSchema>;

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["PENDIENTE", "EN_CURSO", "COMPLETADA"]).optional(),
  priority: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
  date: z.string().refine(isISODate).optional().nullable(),
  dueTime: z.string().refine(isHHMM).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  assigneeName: z.string().optional().nullable(),
  quantity: z.number().positive().optional().nullable(),
});

const include = {
  assignee: { select: { id: true, shortName: true, name: true } },
  createdBy: { select: { id: true, shortName: true } },
  comments: { include: { author: { select: { shortName: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TaskInclude;

export const KIND_LABEL: Record<TaskKind, string> = {
  GENERAL: "General",
  PRODUCCION: "Producción",
  LIMPIEZA: "Limpieza",
  MANTENIMIENTO: "Mantenimiento",
  ADMINISTRATIVA: "Administrativa",
};
export const STATUS_LABEL: Record<TaskStatus, string> = { PENDIENTE: "Pendiente", EN_CURSO: "En curso", COMPLETADA: "Completada" };
export const PRIORITY_LABEL: Record<Priority, string> = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta" };
export const AREA_LABEL: Record<Area, string> = { COCINA: "Cocina", SALA: "Sala", ADMIN: "Administración", GENERAL: "General" };

/** Filtro de visibilidad: managers ven todo; el resto, lo suyo y lo de su área. */
function visibleWhere(actor: Actor): Prisma.TaskWhereInput {
  if (can(actor, "tareas_todas")) return {};
  const or: Prisma.TaskWhereInput[] = [
    { assigneeId: actor.id },
    { createdById: actor.id },
    { assigneeId: null, area: actor.area },
  ];
  if (can(actor, "produccion")) or.push({ kind: "PRODUCCION" });
  return { OR: or };
}

export async function listTasks(
  actor: Actor,
  filter: { date?: string; from?: string; to?: string; status?: TaskStatus | "ABIERTAS"; kind?: TaskKind; mine?: boolean } = {},
) {
  const where: Prisma.TaskWhereInput = { AND: [visibleWhere(actor)] };
  const and = where.AND as Prisma.TaskWhereInput[];
  if (filter.date) and.push({ date: toDbDate(filter.date) });
  if (filter.from || filter.to)
    and.push({ date: { ...(filter.from && { gte: toDbDate(filter.from) }), ...(filter.to && { lte: toDbDate(filter.to) }) } });
  if (filter.status === "ABIERTAS") and.push({ status: { not: "COMPLETADA" } });
  else if (filter.status) and.push({ status: filter.status });
  if (filter.kind) and.push({ kind: filter.kind });
  if (filter.mine) and.push({ OR: [{ assigneeId: actor.id }, { assigneeId: null, area: actor.area }] });
  return db.task.findMany({
    where,
    include,
    orderBy: [{ status: "asc" }, { date: "asc" }, { dueTime: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });
}

export type TaskWithRelations = Awaited<ReturnType<typeof listTasks>>[number];

async function resolveAssignee(input: { assigneeId?: string | null; assigneeName?: string | null }) {
  if (input.assigneeId) {
    const u = await db.user.findUnique({ where: { id: input.assigneeId } });
    if (!u) throw new NotFoundError("Persona no encontrada.");
    return u;
  }
  if (input.assigneeName) {
    const name = input.assigneeName.toLowerCase();
    if (["cocina", "sala", "todos", "equipo"].includes(name)) return null;
    const u = await findUserByName(input.assigneeName);
    if (!u) throw new NotFoundError(`No encuentro a "${input.assigneeName}" en el equipo.`);
    return u;
  }
  return null;
}

export function describeTask(t: { title: string; date: Date | null; dueTime: string | null; assignee?: { shortName: string } | null; area?: Area | null }) {
  const when = t.date ? ` · ${relativeDay(fromDbDate(t.date))}${t.dueTime ? ` antes de las ${t.dueTime}` : ""}` : "";
  const who = t.assignee ? ` · ${t.assignee.shortName}` : t.area ? ` · ${AREA_LABEL[t.area]}` : "";
  return `${t.title}${when}${who}`;
}

export async function createTask(actor: Actor, raw: TaskInput, ctx: ActionContext = {}) {
  const input = taskInputSchema.parse(raw);
  const assignee = await resolveAssignee(input);
  const isProduction = input.kind === "PRODUCCION";

  // Autorización: con tareas_crear se asigna a cualquiera; con producción se
  // crea producción; el resto sólo puede crearse tareas a sí mismo.
  const allowed =
    can(actor, "tareas_crear") ||
    (isProduction && can(actor, "produccion")) ||
    (!assignee || assignee.id === actor.id);
  if (!allowed) throw new ForbiddenError("Sólo podés crearte tareas a vos mismo. Pedile a un responsable que la asigne.");

  const area: Area | null = input.area ?? assignee?.area ?? (isProduction ? "COCINA" : assignee ? null : actor.area);
  const task = await db.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      kind: input.kind,
      area,
      assigneeId: assignee?.id ?? (can(actor, "tareas_crear") || isProduction ? null : actor.id),
      date: input.date ? toDbDate(input.date) : null,
      dueTime: input.dueTime ?? null,
      priority: input.priority,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      createdById: actor.id,
      createdByAi: !!ctx.viaAi,
    },
    include,
  });

  const label = isProduction ? "Producción" : "Tarea";
  await audit(actor, isProduction ? "production.create" : "task.create", `${label} creada: ${describeTask(task)}`, ctx, { taskId: task.id });

  // Notifica al responsable (o al área si es producción sin responsable).
  if (task.assigneeId && task.assigneeId !== actor.id) {
    await notify([task.assigneeId], `Nueva ${label.toLowerCase()} asignada`, describeTask(task), "/tareas");
  } else if (!task.assigneeId && area === "COCINA") {
    const cocina = await db.user.findMany({ where: { area: "COCINA", active: true, NOT: { id: actor.id } } });
    await notify(cocina.map((u) => u.id), `Nueva ${label.toLowerCase()} para cocina`, describeTask(task), "/tareas");
  }
  return task;
}

async function loadEditable(actor: Actor, id: string) {
  const task = await db.task.findFirst({ where: { AND: [{ id }, visibleWhere(actor)] }, include });
  if (!task) throw new NotFoundError("Tarea no encontrada.");
  const canEdit =
    can(actor, "tareas_todas") ||
    task.assigneeId === actor.id ||
    task.createdById === actor.id ||
    (task.assigneeId === null && task.area === actor.area) ||
    (task.kind === "PRODUCCION" && can(actor, "produccion"));
  if (!canEdit) throw new ForbiddenError("No podés modificar esta tarea.");
  return task;
}

export async function updateTask(actor: Actor, id: string, raw: z.input<typeof taskUpdateSchema>, ctx: ActionContext = {}) {
  const input = taskUpdateSchema.parse(raw);
  const task = await loadEditable(actor, id);
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.priority) data.priority = input.priority;
  if (input.date !== undefined) data.date = input.date ? toDbDate(input.date) : null;
  if (input.dueTime !== undefined) data.dueTime = input.dueTime;
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.assigneeId !== undefined || input.assigneeName !== undefined) {
    if (!can(actor, "tareas_crear")) throw new ForbiddenError("Sólo un responsable puede reasignar tareas.");
    const a = await resolveAssignee(input);
    data.assigneeId = a?.id ?? null;
  }
  if (input.status) {
    data.status = input.status;
    data.completedAt = input.status === "COMPLETADA" ? new Date() : null;
  }
  const updated = await db.task.update({ where: { id: task.id }, data, include });
  const changes = Object.keys(data).filter((k) => k !== "completedAt");
  await audit(actor, "task.update", `Tarea actualizada (${changes.join(", ")}): ${describeTask(updated)}`, ctx, { taskId: id });

  if (input.status === "COMPLETADA" && updated.createdById !== actor.id) {
    await notify([updated.createdById], "Tarea completada", `${actor.shortName} completó: ${updated.title}`, "/tareas");
  }
  if (data.assigneeId && data.assigneeId !== task.assigneeId && data.assigneeId !== actor.id) {
    await notify([data.assigneeId as string], "Nueva tarea asignada", describeTask(updated), "/tareas");
  }
  return updated;
}

export async function completeTask(actor: Actor, id: string, ctx: ActionContext = {}) {
  return updateTask(actor, id, { status: "COMPLETADA" }, ctx);
}

export async function addComment(actor: Actor, id: string, body: string, ctx: ActionContext = {}) {
  const text = z.string().trim().min(1).max(1000).parse(body);
  const task = await db.task.findFirst({ where: { AND: [{ id }, visibleWhere(actor)] } });
  if (!task) throw new NotFoundError("Tarea no encontrada.");
  const c = await db.taskComment.create({ data: { taskId: id, authorId: actor.id, body: text } });
  await audit(actor, "task.comment", `Comentario en "${task.title}"`, ctx, { taskId: id });
  const others = [task.assigneeId, task.createdById].filter((x): x is string => !!x && x !== actor.id);
  await notify(others, `Comentario en "${task.title}"`, `${actor.shortName}: ${text}`, "/tareas");
  return c;
}
