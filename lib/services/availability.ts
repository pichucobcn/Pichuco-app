import { db } from "../db";
import { addDays, hhmmToMinutes, isISODate, minutesToHHMM, nowHHMM, toDbDate, todayISO } from "../dates";
import { getSettings, type Settings } from "./settings";

export const RES_SLOT_MIN = 30;
export const TAKEAWAY_SLOT_MIN = 15;

function serviceSlots(settings: Settings, step: number) {
  const out: string[] = [];
  for (const s of settings.services) {
    const [a, b] = s.split("-");
    for (let m = hhmmToMinutes(a); m <= hhmmToMinutes(b); m += step) out.push(minutesToHHMM(m));
  }
  return out;
}

/** ¿Se puede reservar/pedir ese día? Devuelve el motivo si no. */
export function dayClosedReason(settings: Settings, date: string, today = todayISO()): string | null {
  if (!isISODate(date)) return "Fecha no válida.";
  if (date < today) return "Esa fecha ya pasó.";
  if (date > addDays(today, settings.bookingDaysAhead)) return `Se puede reservar con hasta ${settings.bookingDaysAhead} días de antelación.`;
  if (settings.closedDays.includes(new Date(date + "T00:00:00Z").getUTCDay())) return "Ese día está cerrado.";
  return null;
}

/** Franjas de reserva con plazas libres. */
export async function reservationSlots(date: string, people = 1) {
  const settings = await getSettings();
  const closed = dayClosedReason(settings, date);
  if (closed) return { closed, slots: [] as { time: string; free: number; available: boolean }[] };
  const res = await db.reservation.findMany({ where: { date: toDbDate(date), status: { in: ["CONFIRMADA", "SENTADA"] } } });
  const now = date === todayISO() ? hhmmToMinutes(nowHHMM()) + 30 : -1;
  const slots = serviceSlots(settings, RES_SLOT_MIN).map((time) => {
    const used = res.filter((r) => r.time === time).reduce((s, r) => s + r.people, 0);
    const free = Math.max(0, settings.coversPerSlot - used);
    return { time, free, available: hhmmToMinutes(time) > now && free >= people };
  });
  return { closed: null, slots, settings };
}

/** Franjas para retirar pedidos con hueco en el horno. */
export async function takeawaySlots(date: string, pizzas = 1) {
  const settings = await getSettings();
  const closed = dayClosedReason(settings, date);
  if (closed) return { closed, slots: [] as { time: string; free: number; available: boolean }[] };
  const orders = await db.takeawayOrder.findMany({
    where: { date: toDbDate(date), status: { not: "CANCELADO" } },
    include: { lines: { include: { menuItem: true } } },
  });
  const earliest = date === todayISO() ? hhmmToMinutes(nowHHMM()) + settings.takeawayLeadMinutes : -1;
  const slots = serviceSlots(settings, TAKEAWAY_SLOT_MIN).map((time) => {
    const used = orders
      .filter((o) => o.time === time)
      .reduce((s, o) => s + o.lines.filter((l) => l.menuItem?.isPizza).reduce((a, l) => a + l.quantity, 0), 0);
    const free = Math.max(0, settings.takeawayPizzasPerSlot - used);
    return { time, free, available: hhmmToMinutes(time) >= earliest && free >= pizzas };
  });
  return { closed: null, slots, settings };
}

/** Próximos días abiertos, para el selector de fechas. */
export async function openDays(count = 14) {
  const settings = await getSettings();
  const out: string[] = [];
  for (let i = 0; out.length < count && i <= settings.bookingDaysAhead; i++) {
    const d = addDays(todayISO(), i);
    if (!dayClosedReason(settings, d)) out.push(d);
  }
  return out;
}
