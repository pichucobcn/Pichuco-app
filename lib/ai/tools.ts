import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addDays, fromDbDate, isISODate, todayISO, dateOf } from "../dates";
import { can, ForbiddenError } from "../permissions";
import { createAnnouncement } from "../services/announcements";
import { formatSchedule, getPendingItems, getSchedule } from "../services/agenda";
import type { Actor, ActionContext } from "../services/context";
import { reportAbsence, reportDelay } from "../services/incidents";
import { notify } from "../services/notifications";
import { audit } from "../services/audit";
import { completeTask, createTask, describeTask, listTasks, updateTask } from "../services/tasks";
import { findUserByName, teamOverview } from "../services/team";
import { clockRecords } from "../services/clock";
import { findProduct, fmtEur, fmtQty, isLow, listProducts, lowStock, suggestedQuantity } from "../services/stock";
import { findSupplier, DAY_SHORT } from "../services/suppliers";
import {
  allergenLabel,
  createElaboration,
  expiryState,
  foodSafetyDashboard,
  recordCleaning,
  recordTemperature,
  reportNonConformity,
} from "../services/sanidad";
import {
  approveOrder,
  createOrder,
  listOrders,
  orderSummary,
  orderTotalLabel,
  receiveOrder,
  windowText,
  STATUS_LABEL,
  type OrderWithRelations,
} from "../services/purchases";

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

function orderView(o: OrderWithRelations) {
  return {
    number: o.number,
    supplier: o.supplier.name,
    status: STATUS_LABEL[o.status],
    total: orderTotalLabel(o),
    items: orderSummary(o),
    delivery: o.deliveryDate ? fromDbDate(o.deliveryDate) : null,
    deliveryWindow: windowText(o.deliveryTime, o.deliveryTimeTo) || null,
    approvalNote: o.approvalNote,
    callBefore: o.callBefore?.shortName ?? null,
    createdBy: o.createdBy.shortName,
  };
}

export const TOOLS: Record<string, ToolDef> = {
  get_today_summary: {
    description: "Resumen de hoy en Pichuco: personal, producción, tareas y entregas.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => ({ result: scheduleView(await getSchedule(actor, todayISO())) }),
  },
  get_schedule: {
    description: "Agenda completa de un día (personal con retrasos/ausencias, producción, tareas y entregas). Usala para '¿qué tenemos mañana?'.",
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
  get_clock_records: {
    description:
      "Fichajes registrados (entrada, salida, pausas y horas trabajadas) de una persona o de todo el equipo en una fecha o un período. Usalo para '¿a qué hora fichó ayer Juan Pablo?', '¿cuántas horas hizo Eva esta semana?'. Cada uno puede ver los suyos; los de otros, sólo el jefe.",
    schema: z.object({ person: z.string().optional().nullable(), date: optDate.optional(), from: optDate.optional(), to: optDate.optional() }),
    input_schema: {
      type: "object",
      properties: {
        person: { type: "string", description: "Nombre de la persona. Vacío = todo el equipo (o uno mismo si no es jefe)." },
        date: { ...dateProp, description: "Un día concreto (YYYY-MM-DD). Para un período usá from y to." },
        from: dateProp,
        to: dateProp,
      },
    },
    mutates: false,
    run: async (actor, i) => {
      let userId: string | null = null;
      if (i.person) {
        const u = await findUserByName(i.person);
        if (!u) throw new Error(`No encuentro a "${i.person}" en el equipo.`);
        userId = u.id;
      }
      const from = i.date ?? i.from ?? addDays(todayISO(), -6);
      const to = i.date ?? i.to ?? todayISO();
      const days = await clockRecords(actor, { userId, from, to });
      return {
        result: {
          from,
          to,
          days: days.map((d) => ({ date: d.date, person: d.shortName, entrada: d.entrada, salida: d.salida, sinSalida: d.sinSalida, pausas: d.pausas, horas: d.horas, notas: d.notas })),
          totalHoras: days.length ? `${Math.floor(days.reduce((t, d) => t + d.minutos, 0) / 60)} h ${days.reduce((t, d) => t + d.minutos, 0) % 60} min` : "0 h",
          note: days.length ? undefined : "No hay fichajes en ese período.",
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
    description:
      "Registra producción de cocina: qué preparar y para cuándo (p. ej. 10 milanesas para mañana, 8 kg de masa, estirar fugazzetas). La cantidad es opcional: si no la dicen, no la inventes. Una llamada por cada cosa a preparar.",
    schema: z.object({
      item: z.string().trim().min(1),
      quantity: z.number().positive().optional().nullable(),
      unit: z.string().optional(),
      date: optDate,
      due_time: z.string().optional(),
      assignee_name: z.string().optional(),
      priority: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
    }),
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Qué producir, como lo dijeron: 'milanesas', 'masa', 'estirar fugazzetas', 'fainás'." },
        quantity: { type: "number", description: "Sólo si la dijeron." },
        unit: { type: "string", description: "Unidad si no son unidades sueltas: kg, l, bandejas…" },
        date: dateProp,
        due_time: taskProps.due_time,
        assignee_name: taskProps.assignee_name,
        priority: taskProps.priority,
      },
      required: ["item", "date"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const item = i.item.charAt(0).toUpperCase() + i.item.slice(1);
      const title =
        i.quantity == null
          ? item
          : `${Number.isInteger(i.quantity) ? i.quantity : i.quantity.toFixed(1)}${i.unit ? " " + i.unit : ""} ${i.unit ? "de " : ""}${i.item}`.replace(/de de /, "de ");
      const t = await createTask(
        actor,
        {
          title,
          kind: "PRODUCCION",
          area: "COCINA",
          quantity: i.quantity ?? null,
          unit: i.quantity == null ? null : i.unit,
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
  get_stock: {
    description: "Stock actual de un producto (o de todos si no se indica): cantidad, mínimo, proveedor habitual y último precio.",
    schema: z.object({ product: z.string().optional() }),
    input_schema: { type: "object", properties: { product: { type: "string", description: "Nombre del producto, p. ej. 'mozzarella'" } } },
    mutates: false,
    run: async (actor, i) => {
      const view = (p: Awaited<ReturnType<typeof listProducts>>[number]) => ({
        name: p.name,
        stock: fmtQty(p.stock, p.unit),
        min: fmtQty(p.minStock, p.unit),
        low: isLow(p),
        suggestedOrder: isLow(p) ? fmtQty(suggestedQuantity(p), p.unit) : null,
        supplier: p.supplier?.name ?? null,
        lastPrice: p.lastPrice != null ? `${fmtEur(p.lastPrice)}/${p.unit}` : null,
      });
      const all = await listProducts(actor);
      if (!i.product) return { result: all.map(view) };
      const found = await findProduct(i.product);
      const p = found && all.find((x) => x.id === found.id);
      if (!p) throw new Error(`No encuentro "${i.product}" en el stock.`);
      return { result: view(p) };
    },
  },
  get_low_stock: {
    description: "Productos por debajo del stock mínimo, con la cantidad sugerida para pedir y su proveedor.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => ({
      result: (await lowStock(actor)).map((p) => ({
        name: p.name,
        stock: fmtQty(p.stock, p.unit),
        min: fmtQty(p.minStock, p.unit),
        suggestedOrder: suggestedQuantity(p),
        unit: p.unit,
        supplier: p.supplier?.name ?? null,
      })),
    }),
  },
  get_supplier: {
    description: "Datos de un proveedor (por nombre o por producto que vende): contacto, días y hora de reparto, pedido mínimo, condiciones.",
    schema: z.object({ name: z.string() }),
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    mutates: false,
    run: async (actor, i) => {
      if (!can(actor, "proveedores") && !can(actor, "compras")) throw new ForbiddenError("No tenés acceso a proveedores.");
      const s = await findSupplier(i.name);
      if (!s) throw new Error(`No encuentro el proveedor "${i.name}".`);
      return {
        result: {
          name: s.name,
          contact: s.contactName,
          phone: s.phone,
          email: s.email,
          hours: s.hours,
          deliveryDays: s.deliveryDays.map((d) => DAY_SHORT[d]).join(", "),
          deliveryWindow: windowText(s.deliveryTime, s.deliveryTimeTo) || null,
          minOrder: s.minOrder != null ? fmtEur(s.minOrder) : null,
          conditions: s.conditions,
          products: s.products.map((p) => p.name),
        },
      };
    },
  },
  create_purchase_order: {
    description:
      "Prepara un pedido de compra a un proveedor. Busca el proveedor habitual, usa el último precio y aplica las reglas de aprobación (automático, aprobación del jefe u obligatoria). NO envía nada al proveedor ni gasta: el envío se hace desde la app.",
    schema: z.object({
      items: z.array(z.object({ product: z.string(), quantity: z.number().positive() })).min(1),
      supplier: z.string().optional(),
      delivery_date: optDate.optional(),
      call_before: z.string().optional(),
      notes: z.string().optional(),
    }),
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { product: { type: "string" }, quantity: { type: "number", description: "En la unidad del producto (kg, l, cajas…)" } },
            required: ["product", "quantity"],
          },
        },
        supplier: { type: "string", description: "Opcional; si no, el proveedor habitual del producto." },
        delivery_date: { ...dateProp, description: "Para cuándo se necesita (YYYY-MM-DD). Opcional: si no, el próximo día de reparto." },
        call_before: { type: "string", description: "A quién debe llamar el proveedor antes de venir: Martín, Gian o Juan Pablo. Por defecto, quien pide." },
        notes: { type: "string" },
      },
      required: ["items"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const r = await createOrder(
        actor,
        {
          supplierName: i.supplier,
          lines: i.items.map((x: { product: string; quantity: number }) => ({ productName: x.product, quantity: x.quantity })),
          deliveryDate: i.delivery_date,
          callBeforeName: i.call_before,
          notes: i.notes,
        },
        ctx,
      );
      return {
        result: { ...orderView(r.order), approved: r.approved, approvalLevel: r.decision.level },
        summary: `Preparó el pedido #${r.order.number} a ${r.order.supplier.name}: ${orderSummary(r.order)} — ${orderTotalLabel(r.order)}. ${r.order.approvalNote}`,
      };
    },
  },
  get_purchase_orders: {
    description: "Pedidos de compra: abiertos (por defecto), pendientes de aprobación, etc.",
    schema: z.object({ status: z.enum(["ABIERTOS", "PENDIENTE_APROBACION", "APROBADO", "ENVIADO", "CONFIRMADO", "ENTREGADO"]).optional() }),
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["ABIERTOS", "PENDIENTE_APROBACION", "APROBADO", "ENVIADO", "CONFIRMADO", "ENTREGADO"] } },
    },
    mutates: false,
    run: async (actor, i) => ({ result: (await listOrders(actor, { status: i.status ?? "ABIERTOS" })).slice(0, 20).map(orderView) }),
  },
  approve_purchase_order: {
    description: "Aprueba un pedido pendiente (sólo el jefe). Los pedidos por encima del límite del jefe sólo se aprueban desde la pantalla del pedido.",
    schema: z.object({ order_number: z.number().int().positive() }),
    input_schema: { type: "object", properties: { order_number: { type: "integer" } }, required: ["order_number"] },
    mutates: true,
    run: async (actor, i, ctx) => {
      const o = await approveOrder(actor, i.order_number, ctx);
      return { result: orderView(o), summary: `Aprobó el pedido #${o.number} (${orderTotalLabel(o)})` };
    },
  },
  receive_purchase_order: {
    description: "Registra que llegó un pedido: suma las cantidades al stock y actualiza el último precio. Usar cuando digan 'llegó la harina' o 'llegó el pedido 12'.",
    schema: z.object({ order_number: z.number().int().positive() }),
    input_schema: { type: "object", properties: { order_number: { type: "integer" } }, required: ["order_number"] },
    mutates: true,
    run: async (actor, i, ctx) => {
      const o = await receiveOrder(actor, i.order_number, {}, ctx);
      return { result: orderView(o), summary: `Registró la entrega del pedido #${o.number} y sumó al stock: ${orderSummary(o)}` };
    },
  },
  register_temperature: {
    description:
      "Registra la temperatura de una cámara, congelador o nevera (control APPCC). Si está fuera de rango, se abre una incidencia y se avisa a los responsables; pedí la acción correctora si no la dijeron.",
    schema: z.object({ equipment: z.string(), value: z.number(), corrective_action: z.string().optional() }),
    input_schema: {
      type: "object",
      properties: {
        equipment: { type: "string", description: "Equipo por su código: neveras B1, B2, C1–C6; congeladores B3 y C7 (por ejemplo 'C1' o 'B3')." },
        value: { type: "number", description: "Grados centígrados" },
        corrective_action: { type: "string", description: "Qué se hizo si estaba fuera de rango" },
      },
      required: ["equipment", "value"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const r = await recordTemperature(actor, { equipmentName: i.equipment, value: i.value, correctiveAction: i.corrective_action }, ctx);
      return {
        result: { equipment: r.equipment.name, value: i.value, range: r.range, outOfRange: r.outOfRange, incidentOpen: !!r.nc && r.nc.status === "ABIERTA" },
        summary: `Registró ${r.equipment.name}: ${i.value} °C${r.outOfRange ? ` (fuera de rango ${r.range}, incidencia${r.nc?.status === "CERRADA" ? " con acción correctora" : " abierta"})` : ""}`,
      };
    },
  },
  register_cleaning: {
    description: "Marca como hecha una limpieza del plan (campana, horno, cámaras, suelos, baños…).",
    schema: z.object({ item: z.string(), notes: z.string().optional() }),
    input_schema: { type: "object", properties: { item: { type: "string" }, notes: { type: "string" } }, required: ["item"] },
    mutates: true,
    run: async (actor, i, ctx) => {
      const r = await recordCleaning(actor, { itemName: i.item, notes: i.notes }, ctx);
      return { result: { item: r.item.name, area: r.item.area }, summary: `Registró la limpieza de ${r.item.name}` };
    },
  },
  register_elaboration: {
    description: "Registra una elaboración propia (masa, salsa, milanesas…) para trazabilidad: asigna lote y calcula la caducidad para la etiqueta.",
    schema: z.object({ product: z.string(), quantity: z.number().positive().optional(), unit: z.string().optional() }),
    input_schema: {
      type: "object",
      properties: { product: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" } },
      required: ["product"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const e = await createElaboration(actor, { typeName: i.product, name: i.product, quantity: i.quantity, unit: i.unit }, ctx);
      return {
        result: { id: e.id, name: e.name, lot: e.lot, expires: dateOf(e.expiresAt), allergens: e.allergens.map(allergenLabel), label: `/sanidad/etiquetas/${e.id}` },
        summary: `Registró la elaboración ${e.name} (lote ${e.lot})`,
      };
    },
  },
  get_food_safety_status: {
    description: "Estado de los controles sanitarios de hoy: temperaturas por tomar, limpiezas pendientes, elaboraciones por caducar e incidencias abiertas.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => {
      const d = await foodSafetyDashboard(actor);
      return {
        result: {
          temperaturesPending: d.tempsPending.map((e) => ({ equipment: e.name, toca: e.nextLabel, doneThisWeek: e.done, requiredPerWeek: e.required })),
          temperatureControl: "Semanal: una lectura al inicio de la semana (miércoles) y otra al final (lunes).",
          cleaningPending: d.cleaningDue.map((c) => ({ item: c.name, frequency: c.frequency })),
          expiring: d.expiring.map((e) => ({ name: e.name, lot: e.lot, state: expiryState(e.expiresAt) })),
          openIncidents: d.openNcs.map((n) => n.description),
        },
      };
    },
  },
  report_food_incident: {
    description: "Registra una incidencia sanitaria (no conformidad): algo que no está bien en higiene, temperaturas, mercancía, plagas…",
    schema: z.object({ description: z.string(), corrective_action: z.string().optional() }),
    input_schema: {
      type: "object",
      properties: { description: { type: "string" }, corrective_action: { type: "string" } },
      required: ["description"],
    },
    mutates: true,
    run: async (actor, i, ctx) => {
      const nc = await reportNonConformity(actor, { description: i.description, correctiveAction: i.corrective_action }, ctx);
      return { result: { status: nc.status }, summary: `Registró la incidencia sanitaria: ${i.description}` };
    },
  },
  get_pending_items: {
    description: "Pendientes del usuario: tareas abiertas y comunicados sin leer.",
    schema: z.object({}),
    input_schema: { type: "object", properties: {} },
    mutates: false,
    run: async (actor) => {
      const p = await getPendingItems(actor);
      return { result: { tasks: p.tasks.slice(0, 30).map(taskView), unreadAnnouncements: p.unreadAnnouncements, approvals: p.approvals, lowStock: p.lowStock } };
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
