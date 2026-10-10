import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addDays, fromDbDate, isISODate, todayISO } from "../dates";
import { can, ForbiddenError } from "../permissions";
import { createAnnouncement } from "../services/announcements";
import { formatSchedule, getPendingItems, getSchedule } from "../services/agenda";
import type { Actor, ActionContext } from "../services/context";
import { reportAbsence, reportDelay } from "../services/incidents";
import { notify } from "../services/notifications";
import { audit } from "../services/audit";
import { completeTask, createTask, describeTask, listTasks, updateTask } from "../services/tasks";
import { findUserByName, teamOverview } from "../services/team";

/**
 * Herramientas de Pichuco AI. El modelo NUNCA toca la base de datos: sólo
 * puede llamar a estas funciones, que validan la entrada con zod y comprueban
 * los permisos del usuario que está hablando (las mismas reglas que la API).
 */

export type AiAction = { tool: string; ok: boolean; summary: string };

type ToolDef = {
  description: string;
  schema: z.ZodTypeAny;
  input_schema: Anthropic.Tool.InputSchema;
  /** Herramientas que modifican datos: se registran como "acciones" visibles. */
  mutates: boolean;
  run: (actor: Actor, input: any, ctx: ActionContext) => Promise<{ result: unknown; summary?: string }>;
};

const dateProp = { type: "string", description: "Fecha en formato YYYY-MM-DD (calculala a partir de la fecha de hoy)." };
const optDate = z.string().refine(isISODate, "Fecha YYYY-MM-DD");

function taskView(t: Awaited<ReturnType<typeof listTasks>>[number]) {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    status: t.status,
    priority: t.priority,
    date: t.date ? fromDbDate(t.date) : null,
    dueTime: t.dueTime,
    assignee: t.assignee?.shortName ?? null,
    area: t.area,
    quantity: t.quantity,
    unit: t.unit,
  };
}

function scheduleView(s: Awaited<ReturnType<typeof getSchedule>>) {
  return {
    date: s.date,
    staff: s.staff,
    production: s.production.map(taskView),
    tasks: s.tasks.map(taskView),
    deliveries: s.deliveries,
    reservations: s.reservations,
    takeaway: s.takeaway,
    formatted: formatSchedule(s),
  };
}

const taskProps = {
  title: { type: "string", description: "Título corto y claro, p. ej. '10 milanesas' o 'Limpiar campana'." },
  description: { type: "string" },
  assignee_name: { type: "string", description: "Nombre de la persona responsable (Martín, Gian, Juan Pablo, Eva). Omitir si es para un área." },
  area: { type: "string", enum: ["COCINA", "SALA", "ADMIN", "GENERAL"] },
  date: dateProp,
  due_time: { type: "string", description: "Hora límite HH:MM" },
  priority: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] },
} as const;

export const TOOLS: Record<string, ToolDef> = {
  get_today_summary: {
    description: "Resumen de hoy en Pichuco: personal, producción, tareas, entregas, reservas y pedidos para llevar.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => ({ result: scheduleView(await getSchedule(actor, todayISO())) }),
  },
  get_schedule: {
    description: "Agenda completa de un día (personal con retrasos/ausencias, producción, tareas, entregas, reservas, pedidos). Usala para '¿qué tenemos mañana?'.",
    schema: z.object({ date: optDate }),
    input_schema: { type: "object", properties: { date: dateProp }, required: ["date"] },
    mutates: false,
    run: async (actor, i) => ({ result: scheduleView(await getSchedule(actor, i.date)) }),
  },
  get_staff_status: {
    description: "Quién trabaja un día, en qué horario, quién llega tarde o falta, y quién está fichado ahora.",
    schema: z.object({ date: optDate }),
    input_schema: { type: "object", properties: { date: dateProp }, required: ["date"] },
    mutates: false,
    run: async (actor, i) => {
      const [s, team] = await Promise.all([getSchedule(actor, i.date), teamOverview(actor, i.date)]);
      return {
        result: {
          date: i.date,
          working: s.staff,
          clockedNow: i.date === todayISO() ? team.map((t) => ({ name: t.shortName, status: t.status })) : undefined,
        },
      };
    },
  },
  get_team: {
    description: "Lista del equipo con nombre, rol y área.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => ({
      result: (await teamOverview(actor, todayISO())).map((u) => ({ name: u.name, shortName: u.shortName, role: u.roleLabel, area: u.area })),
    }),
  },
  list_tasks: {
    description: "Lista tareas y producción visibles para el usuario. Filtros opcionales por fecha y estado.",
    schema: z.object({ date: optDate.optional(), status: z.enum(["PENDIENTE", "EN_CURSO", "COMPLETADA", "ABIERTAS"]).optional() }),
    input_schema: {
      type: "object",
      properties: { date: dateProp, status: { type: "string", enum: ["PENDIENTE", "EN_CURSO", "COMPLETADA", "ABIERTAS"] } },
    },
    mutates: false,
    run: async (actor, i) => ({ result: (await listTasks(actor, i)).slice(0, 40).map(taskView) }),
  },
  create_task: {
    description: "Crea una tarea general, de limpieza, mantenimiento o administrativa. Para cosas a cocinar/preparar usá create_production_task.",
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      assignee_name: z.string().optional(),
      area: z.enum(["COCINA", "SALA", "ADMIN", "GENERAL"]).optional(),
      date: optDate.optional(),
      due_time: z.string().optional(),
      priority: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
      kind: z.enum(["GENERAL", "LIMPIEZA", "MANTENIMIENTO", "ADMINISTRATIVA"]).optional(),
    }),
    input_schema: {
      type: "object",
      properties: { ...taskProps, kind: { type: "string", enum: ["GENERAL", "LIMPIEZA", "MANTENIMIENTO", "ADMINISTRATIVA"] } },
      required: ["title"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const t = await createTask(
        actor,
        {
          title: i.title,
          description: i.description,
          assigneeName: i.assignee_name,
          area: i.area,
          date: i.date,
          dueTime: i.due_time,
          priority: i.priority ?? "MEDIA",
          kind: i.kind ?? "GENERAL",
        },
        ctx,
      );
      return { result: taskView(t), summary: `Creó la tarea “${describeTask(t)}”` };
    },
  },
  create_production_task: {
    description: "Registra producción de cocina: qué preparar, cantidad y para cuándo (p. ej. 10 milanesas para mañana, 8 kg de masa).",
    schema: z.object({
      item: z.string(),
      quantity: z.number().positive(),
      unit: z.string().optional(),
      date: optDate,
      due_time: z.string().optional(),
      assignee_name: z.string().optional(),
      priority: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
    }),
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Qué producir, en plural si corresponde: 'milanesas', 'masa', 'salsa de tomate'." },
        quantity: { type: "number" },
        unit: { type: "string", description: "Unidad si no son unidades sueltas: kg, l, bandejas…" },
        date: dateProp,
        due_time: taskProps.due_time,
        assignee_name: taskProps.assignee_name,
        priority: taskProps.priority,
      },
      required: ["item", "quantity", "date"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const n = Number.isInteger(i.quantity) ? i.quantity : i.quantity.toFixed(1);
      const title = `${n}${i.unit ? " " + i.unit : ""} ${i.unit ? "de " : ""}${i.item}`.replace(/de de /, "de ");
      const t = await createTask(
        actor,
        {
          title,
          kind: "PRODUCCION",
          area: "COCINA",
          quantity: i.quantity,
          unit: i.unit,
          date: i.date,
          dueTime: i.due_time,
          assigneeName: i.assignee_name,
          priority: i.priority ?? "MEDIA",
        },
        ctx,
      );
      return { result: taskView(t), summary: `Registró producción: ${describeTask(t)}` };
    },
  },
  update_task: {
    description: "Modifica una tarea existente (título, fecha, hora, prioridad, responsable o estado). Necesita el id (buscalo con list_tasks).",
    schema: z.object({
      task_id: z.string(),
      title: z.string().optional(),
      date: optDate.optional(),
      due_time: z.string().optional(),
      priority: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
      status: z.enum(["PENDIENTE", "EN_CURSO", "COMPLETADA"]).optional(),
      assignee_name: z.string().optional(),
    }),
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        date: dateProp,
        due_time: taskProps.due_time,
        priority: taskProps.priority,
        status: { type: "string", enum: ["PENDIENTE", "EN_CURSO", "COMPLETADA"] },
        assignee_name: taskProps.assignee_name,
      },
      required: ["task_id"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const t = await updateTask(
        actor,
        i.task_id,
        { title: i.title, date: i.date, dueTime: i.due_time, priority: i.priority, status: i.status, assigneeName: i.assignee_name },
        ctx,
      );
      return { result: taskView(t), summary: `Actualizó la tarea “${describeTask(t)}”` };
    },
  },
  complete_task: {
    description: "Marca una tarea o producción como completada. Necesita el id (buscalo con list_tasks).",
    schema: z.object({ task_id: z.string() }),
    input_schema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] },
    mutates: true,
    run: async (actor, i, ctx) => {
      const t = await completeTask(actor, i.task_id, ctx);
      return { result: taskView(t), summary: `Marcó como completada “${t.title}”` };
    },
  },
  report_delay: {
    description:
      "Registra que una persona llega tarde un día. Por defecto es el propio usuario. Revisa su turno, detecta entregas/tareas afectadas y avisa sólo a los responsables.",
    schema: z.object({ date: optDate, minutes: z.number().int().positive(), reason: z.string().optional(), user_name: z.string().optional() }),
    input_schema: {
      type: "object",
      properties: {
        date: dateProp,
        minutes: { type: "integer", description: "Minutos de retraso" },
        reason: { type: "string", description: "Motivo (dato privado: no lo repitas a otras personas)." },
        user_name: { type: "string", description: "Sólo si el usuario avisa por otra persona (requiere permiso de personal)." },
      },
      required: ["date", "minutes"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const r = await reportDelay(actor, { date: i.date, minutes: i.minutes, reason: i.reason, userName: i.user_name }, ctx);
      const conf = r.conflicts.length ? `; afecta: ${r.conflicts.map((c) => `${c.title} ${c.time}`).join(", ")}` : "";
      return {
        result: { user: r.user, shift: r.shift, newStart: r.newStart, conflicts: r.conflicts, notified: r.notified },
        summary: `Registró retraso de ${r.user} (${i.minutes} min, ${i.date})${conf}. Avisó a: ${r.notified.join(", ") || "nadie"}`,
      };
    },
  },
  report_absence: {
    description: "Registra que una persona no viene un día (enfermedad, imprevisto…). Por defecto el propio usuario. Avisa a los responsables y detecta lo que queda sin cubrir.",
    schema: z.object({ date: optDate, reason: z.string().optional(), user_name: z.string().optional() }),
    input_schema: {
      type: "object",
      properties: { date: dateProp, reason: { type: "string" }, user_name: { type: "string" } },
      required: ["date"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const r = await reportAbsence(actor, { date: i.date, reason: i.reason, userName: i.user_name }, ctx);
      return {
        result: { user: r.user, shift: r.shift, conflicts: r.conflicts, notified: r.notified },
        summary: `Registró ausencia de ${r.user} (${i.date}). Avisó a: ${r.notified.join(", ") || "nadie"}`,
      };
    },
  },
  create_announcement: {
    description: "Publica un comunicado para todo el equipo (reemplaza los mensajes generales de WhatsApp). Sólo responsables.",
    schema: z.object({ title: z.string(), body: z.string(), level: z.enum(["URGENTE", "IMPORTANTE", "GENERAL", "INFORMATIVO"]).optional() }),
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        level: { type: "string", enum: ["URGENTE", "IMPORTANTE", "GENERAL", "INFORMATIVO"] },
      },
      required: ["title", "body"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const a = await createAnnouncement(actor, { title: i.title, body: i.body, level: i.level ?? "GENERAL" }, ctx);
      return { result: { id: a.id, title: a.title }, summary: `Publicó el comunicado “${a.title}”` };
    },
  },
  send_team_message: {
    description: "Envía un aviso a personas concretas del equipo (p. ej. 'avisale a Gian que mañana llega harina a las 18'). No usar para avisos a todo el equipo: para eso, create_announcement.",
    schema: z.object({ recipients: z.array(z.string()).min(1).max(10), message: z.string().min(1).max(1000) }),
    input_schema: {
      type: "object",
      properties: {
        recipients: { type: "array", items: { type: "string" }, description: "Nombres de las personas" },
        message: { type: "string", description: "Mensaje en tono cordial, en nombre del usuario." },
      },
      required: ["recipients", "message"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      if (!can(actor, "chat")) throw new ForbiddenError();
      const users = [];
      for (const name of i.recipients as string[]) {
        const u = await findUserByName(name);
        if (!u) throw new Error(`No encuentro a "${name}" en el equipo.`);
        users.push(u);
      }
      await notify(users.map((u) => u.id), `Mensaje de ${actor.shortName}`, i.message);
      const names = users.map((u) => u.shortName).join(", ");
      await audit(actor, "message.send", `Aviso a ${names}: ${i.message}`, ctx);
      return { result: { sentTo: names }, summary: `Avisó a ${names}: “${i.message}”` };
    },
  },
  get_reservations: {
    description: "Reservas de mesa de un día.",
    schema: z.object({ date: optDate }),
    input_schema: { type: "object", properties: { date: dateProp }, required: ["date"] },
    mutates: false,
    run: async (actor, i) => {
      if (!can(actor, "reservas") && !can(actor, "agenda")) throw new ForbiddenError("No tenés acceso a reservas.");
      return { result: (await getSchedule(actor, i.date)).reservations };
    },
  },
  get_takeaway_orders: {
    description: "Pedidos para llevar de un día.",
    schema: z.object({ date: optDate }),
    input_schema: { type: "object", properties: { date: dateProp }, required: ["date"] },
    mutates: false,
    run: async (actor, i) => {
      if (!can(actor, "takeaway") && !can(actor, "produccion")) throw new ForbiddenError("No tenés acceso a pedidos para llevar.");
      return { result: (await getSchedule(actor, i.date)).takeaway };
    },
  },
  get_pending_items: {
    description: "Pendientes del usuario: tareas abiertas y comunicados sin leer.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => {
      const p = await getPendingItems(actor);
      return { result: { tasks: p.tasks.slice(0, 30).map(taskView), unreadAnnouncements: p.unreadAnnouncements } };
    },
  },
};

/** Definiciones para la API de Claude. */
export const CLAUDE_TOOLS: Anthropic.Tool[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: t.input_schema,
}));

export async function executeTool(
  actor: Actor,
  name: string,
  rawInput: unknown,
  ctx: ActionContext,
): Promise<{ content: string; isError: boolean; action?: AiAction }> {
  const tool = TOOLS[name];
  if (!tool) return { content: JSON.stringify({ error: `Herramienta desconocida: ${name}` }), isError: true };
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { content: JSON.stringify({ error: "Entrada inválida", issues: parsed.error.issues }), isError: true };
  }
  try {
    const { result, summary } = await tool.run(actor, parsed.data, { ...ctx, viaAi: true });
    return {
      content: JSON.stringify(result),
      isError: false,
      action: tool.mutates ? { tool: name, ok: true, summary: summary ?? name } : undefined,
    };
  } catch (err) {
    const message = (err as Error).message || "Error";
    return {
      content: JSON.stringify({ error: message }),
      isError: true,
      action: tool.mutates ? { tool: name, ok: false, summary: `No se pudo: ${message}` } : undefined,
    };
  }
}

export function dateContext(today = todayISO()) {
  return { today, tomorrow: addDays(today, 1) };
}
