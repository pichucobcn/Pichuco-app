import { db } from "../db";
import { addDays, toDbDate } from "../dates";

/**
 * Previsión simple de demanda para cocina. Cruza reservas y pedidos para
 * llevar con la producción de masa planificada. Es una regla transparente,
 * no un modelo: se puede ajustar con los números reales de Pichuco.
 */
export const PIZZAS_PER_DINER = 0.55; // en sala se comparten pizzas
export const DOUGH_KG_PER_PIZZA = 0.28; // un bollo de 280 g
export const WALK_IN_FACTOR = 1.25; // gente que viene sin reserva
const TYPICAL_PIZZAS = 40; // referencia si todavía no hay historial

async function pizzasFor(date: string) {
  const d = toDbDate(date);
  const [res, orders] = await Promise.all([
    db.reservation.findMany({ where: { date: d, status: { in: ["CONFIRMADA", "SENTADA"] } } }),
    db.takeawayOrder.findMany({ where: { date: d, status: { not: "CANCELADO" } }, include: { lines: { include: { menuItem: true } } } }),
  ]);
  const covers = res.reduce((s, r) => s + r.people, 0);
  const takeawayPizzas = orders.reduce((s, o) => s + o.lines.filter((l) => l.menuItem?.isPizza).reduce((a, l) => a + l.quantity, 0), 0);
  return { covers, reservations: res.length, takeawayOrders: orders.length, takeawayPizzas, pizzas: Math.round(covers * PIZZAS_PER_DINER * WALK_IN_FACTOR + takeawayPizzas) };
}

export async function demandForecast(date: string) {
  const today = await pizzasFor(date);
  // Media del mismo día de la semana en las 4 semanas anteriores
  const past = await Promise.all([1, 2, 3, 4].map((w) => pizzasFor(addDays(date, -7 * w))));
  const withData = past.filter((p) => p.pizzas > 0);
  const baseline = withData.length ? Math.round(withData.reduce((s, p) => s + p.pizzas, 0) / withData.length) : TYPICAL_PIZZAS;

  const dough = await db.task.findMany({ where: { date: toDbDate(date), kind: "PRODUCCION", title: { contains: "masa", mode: "insensitive" } } });
  const doughPlannedKg = dough.reduce((s, t) => s + (t.unit === "kg" ? (t.quantity ?? 0) : 0), 0);
  const doughNeededKg = Math.ceil(today.pizzas * DOUGH_KG_PER_PIZZA);
  const extraKg = Math.max(0, doughNeededKg - doughPlannedKg);
  const ratio = baseline ? today.pizzas / baseline : 1;
  const level = ratio >= 1.2 ? "alta" : ratio <= 0.8 ? "baja" : "normal";

  let message = `Previstas unas ${today.pizzas} pizzas (${today.covers} comensales con reserva y ${today.takeawayPizzas} pizzas para llevar).`;
  if (level === "alta") message = `La demanda prevista es superior a la habitual: unas ${today.pizzas} pizzas frente a ${baseline} de media.`;
  if (extraKg > 0) message += ` Recomiendo preparar ${extraKg} kg adicionales de masa (hay ${doughPlannedKg} kg planificados, harían falta ${doughNeededKg}).`;
  else if (doughPlannedKg > 0) message += ` La masa planificada (${doughPlannedKg} kg) alcanza.`;

  return { date, ...today, baseline, level, doughNeededKg, doughPlannedKg, extraKg, message };
}

export type DemandForecast = Awaited<ReturnType<typeof demandForecast>>;
