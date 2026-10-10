import { db } from "../db";
import { addDays, currentHour, hhmmToMinutes, minutesToHHMM, relativeDay, toDbDate, todayISO } from "../dates";
import { can } from "../permissions";
import type { Actor } from "./context";
import { incidentsForDate } from "./incidents";
import { listTasks } from "./tasks";
import { shiftsForDate } from "./team";

/** Agenda cruzada de un día: personal, producción, tareas, entregas, reservas y pedidos. */
export async function getSchedule(actor: Actor, date: string) {
  const seeReservations = can(actor, "reservas") || can(actor, "agenda");
  const seeTakeaway = can(actor, "takeaway") || can(actor, "produccion");
  const [shifts, incidents, tasks, events] = await Promise.all([
    shiftsForDate(date),
    incidentsForDate(actor, date),
    listTasks(actor, { date }),
    db.agendaEvent.findMany({ where: { date: toDbDate(date) }, include: { responsible: true }, orderBy: { time: "asc" } }),
  ]);

  const staff = shifts.map((s) => {
    const inc = incidents.filter((i) => i.userId === s.userId);
    const absent = inc.find((i) => i.type === "AUSENCIA");
    const delay = inc.find((i) => i.type === "RETRASO");
    return {
      userId: s.userId,
      name: s.user.shortName,
      start: s.start,
      end: s.end,
      effectiveStart: delay?.minutes ? minutesToHHMM(hhmmToMinutes(s.start) + delay.minutes) : s.start,
      delayMinutes: delay?.minutes ?? null,
      absent: !!absent,
      reason: (absent ?? delay)?.reason ?? null,
    };
  });

  const ev = (kind: string) =>
    events
      .filter((e) => e.kind === kind)
      .map((e) => ({ id: e.id, time: e.time, title: e.title, people: e.people, detail: e.detail, responsible: e.responsible?.shortName ?? null }));

  return {
    date,
    label: relativeDay(date),
    staff,
    incidents,
    production: tasks.filter((t) => t.kind === "PRODUCCION"),
    tasks: tasks.filter((t) => t.kind !== "PRODUCCION"),
    deliveries: ev("ENTREGA"),
    reservations: seeReservations ? ev("RESERVA") : [],
    takeaway: seeTakeaway ? ev("TAKEAWAY") : [],
    other: ev("OTRO"),
  };
}

export type Schedule = Awaited<ReturnType<typeof getSchedule>>;

function qty(t: { quantity: number | null; unit: string | null; title: string }) {
  if (!t.quantity) return t.title;
  const n = Number.isInteger(t.quantity) ? t.quantity : t.quantity.toFixed(1);
  return t.title.match(/^\d/) ? t.title : `${n}${t.unit ? " " + t.unit : ""} ${t.title}`;
}

/** Resumen en texto tipo "MAÑANA EN PICHUCO" que usan Pichuco AI y la Home. */
export function formatSchedule(s: Schedule): string {
  const lines: string[] = [`${s.label.toUpperCase()} EN PICHUCO`];
  lines.push("", "👥 Personal");
  if (!s.staff.length) lines.push("• Sin turnos cargados");
  for (const p of s.staff) {
    if (p.absent) lines.push(`• ${p.name} — no viene`);
    else if (p.delayMinutes) lines.push(`• ${p.name} ${p.effectiveStart} (llega ${p.delayMinutes}' tarde; turno ${p.start})`);
    else lines.push(`• ${p.name} ${p.start}–${p.end}`);
  }
  if (s.production.length) {
    lines.push("", "🍕 Producción");
    for (const t of s.production) lines.push(`• ${qty(t)}${t.status === "COMPLETADA" ? " ✓" : ""}${t.dueTime ? ` (antes de ${t.dueTime})` : ""}`);
  }
  if (s.tasks.length) {
    lines.push("", "✅ Tareas");
    for (const t of s.tasks)
      lines.push(`• ${t.title}${t.assignee ? ` — ${t.assignee.shortName}` : ""}${t.status === "COMPLETADA" ? " ✓" : ""}`);
  }
  if (s.deliveries.length) {
    lines.push("", "📦 Entregas");
    for (const e of s.deliveries) lines.push(`• ${e.title} ${e.time}${e.responsible ? ` (recibe ${e.responsible})` : ""}`);
  }
  if (s.reservations.length) {
    lines.push("", "🪑 Reservas");
    for (const e of s.reservations) lines.push(`• ${e.time} — ${e.people} personas${e.title ? ` (${e.title})` : ""}`);
  }
  if (s.takeaway.length) {
    lines.push("", "🥡 Para llevar");
    for (const e of s.takeaway) lines.push(`• ${e.time} — ${e.title}${e.detail ? `: ${e.detail}` : ""}`);
  }
  return lines.join("\n");
}

/** Mensaje de bienvenida dinámico de la Home (sin IA, instantáneo). */
export async function greeting(actor: Actor) {
  const today = todayISO();
  const s = await getSchedule(actor, today);
  const h = currentHour();
  const hello = h < 13 ? "¡Buenos días" : h < 20 ? "¡Buenas tardes" : "¡Buenas noches";
  const bits: string[] = [];
  if (can(actor, "reservas") || can(actor, "takeaway") || actor.role === "JEFE") {
    if (s.reservations.length) bits.push(`${s.reservations.length} ${s.reservations.length === 1 ? "reserva" : "reservas"}`);
  }
  if (s.takeaway.length) bits.push(`${s.takeaway.length} ${s.takeaway.length === 1 ? "pedido" : "pedidos"} para llevar`);
  const prod = s.production.filter((t) => t.status !== "COMPLETADA");
  if (prod.length) bits.push(`${prod.length} ${prod.length === 1 ? "producción pendiente" : "producciones pendientes"}`);
  for (const d of s.deliveries) bits.push(`una entrega de ${d.title.replace(/^entrega( de)?\s*/i, "").toLowerCase()} a las ${d.time}`);

  const mine = s.staff.find((p) => p.userId === actor.id);
  const shift = mine ? (mine.absent ? " Hoy figurás como ausente." : ` Tu turno: ${mine.effectiveStart}–${mine.end}.`) : "";
  const list = bits.length > 1 ? `${bits.slice(0, -1).join(", ")} y ${bits.at(-1)}` : bits[0];
  return {
    text: `${hello}, ${actor.shortName}!\n\n${list ? `Hoy tenemos ${list}.` : "Hoy está tranquilo por ahora."}${shift}\n\n¿Querés ver el detalle o crear alguna tarea?`,
    schedule: s,
  };
}

/** Pendientes del usuario: tareas abiertas, comunicados sin leer, incidencias próximas. */
export async function getPendingItems(actor: Actor) {
  const [tasks, unread] = await Promise.all([
    listTasks(actor, { status: "ABIERTAS", mine: !can(actor, "tareas_todas") }),
    db.announcement.findMany({ where: { reads: { none: { userId: actor.id } } }, select: { title: true, level: true } }),
  ]);
  return { tasks, unreadAnnouncements: unread };
}
