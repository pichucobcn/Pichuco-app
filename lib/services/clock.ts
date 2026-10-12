import type { ClockEvent, ClockType } from "@prisma/client";
import { db } from "../db";
import { serviceDayOf, timeOf, todayISO, toDbDate, addDays } from "../dates";
import { assertCan, can, ValidationError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";

export type ClockState = "fuera" | "trabajando" | "en pausa";

const LABEL: Record<ClockType, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  PAUSA_INICIO: "Inicio de pausa",
  PAUSA_FIN: "Fin de pausa",
};

function stateAfter(last?: ClockEvent | null): ClockState {
  if (!last || last.type === "SALIDA") return "fuera";
  if (last.type === "PAUSA_INICIO") return "en pausa";
  return "trabajando";
}

const ALLOWED: Record<ClockState, ClockType[]> = {
  fuera: ["ENTRADA"],
  trabajando: ["PAUSA_INICIO", "SALIDA"],
  "en pausa": ["PAUSA_FIN"],
};

/** Minutos trabajados (sin pausas) en una secuencia de fichajes ordenada. */
export function workedMinutes(events: Pick<ClockEvent, "type" | "at">[], until = new Date()): number {
  let total = 0;
  let since: Date | null = null;
  for (const e of events) {
    if (e.type === "ENTRADA" || e.type === "PAUSA_FIN") since = e.at;
    else if (since) {
      total += (e.at.getTime() - since.getTime()) / 60_000;
      since = null;
    }
  }
  if (since) total += (until.getTime() - since.getTime()) / 60_000;
  return Math.max(0, Math.round(total));
}

async function lastEvent(userId: string) {
  return db.clockEvent.findFirst({ where: { userId }, orderBy: { at: "desc" } });
}

/** Jornada actual: desde la última ENTRADA. */
export async function currentJourney(actor: Actor) {
  assertCan(actor, "fichaje");
  const lastIn = await db.clockEvent.findFirst({ where: { userId: actor.id, type: "ENTRADA" }, orderBy: { at: "desc" } });
  const last = await lastEvent(actor.id);
  const state = stateAfter(last);
  const events =
    lastIn && (state !== "fuera" || serviceDayOf(lastIn.at) === serviceDayOf(new Date()))
      ? await db.clockEvent.findMany({ where: { userId: actor.id, at: { gte: lastIn.at } }, orderBy: { at: "asc" } })
      : [];
  return { state, events, worked: workedMinutes(events), allowed: ALLOWED[state] };
}

export async function clock(actor: Actor, type: ClockType, note: string | undefined, ctx: ActionContext = {}) {
  assertCan(actor, "fichaje");
  const state = stateAfter(await lastEvent(actor.id));
  if (!ALLOWED[state].includes(type)) {
    throw new ValidationError(`No podés registrar "${LABEL[type]}" ahora: estás ${state}.`);
  }
  const ev = await db.clockEvent.create({ data: { userId: actor.id, type, note } });
  await audit(actor, "clock." + type.toLowerCase(), `${LABEL[type]} a las ${timeOf(ev.at)}`, ctx);
  return ev;
}

/** Histórico propio de los últimos días, agrupado por fecha. */
export async function myHistory(actor: Actor, days = 14) {
  assertCan(actor, "fichaje");
  const from = toDbDate(addDays(todayISO(), -days));
  const events = await db.clockEvent.findMany({ where: { userId: actor.id, at: { gte: from } }, orderBy: { at: "asc" } });
  return groupByDay(events);
}

function groupByDay(events: ClockEvent[]) {
  const map = new Map<string, ClockEvent[]>();
  for (const e of events) {
    const d = serviceDayOf(e.at);
    map.set(d, [...(map.get(d) ?? []), e]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, evs]) => ({
      date,
      events: evs.map((e) => ({ type: e.type, label: LABEL[e.type], time: timeOf(e.at), note: e.note })),
      worked: workedMinutes(evs, evs.at(-1)?.type === "SALIDA" ? evs.at(-1)!.at : new Date()),
    }));
}

/** Fichajes del equipo para un día (sólo managers). */
export async function teamClock(actor: Actor, date: string) {
  assertCan(actor, "fichajes_equipo");
  const start = new Date(toDbDate(date).getTime() - 3 * 3_600_000);
  const end = new Date(toDbDate(addDays(date, 1)).getTime() + 6 * 3_600_000);
  const [users, events, incidents] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.clockEvent.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
    db.incident.findMany({ where: { date: toDbDate(date) } }),
  ]);
  return users.map((u) => {
    const evs = events.filter((e) => e.userId === u.id && serviceDayOf(e.at) === date);
    return {
      user: { id: u.id, name: u.name, shortName: u.shortName },
      events: evs.map((e) => ({ type: e.type, label: LABEL[e.type], time: timeOf(e.at) })),
      worked: workedMinutes(evs, evs.at(-1)?.type === "SALIDA" ? evs.at(-1)!.at : new Date()),
      incidents: incidents.filter((i) => i.userId === u.id),
    };
  });
}

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;

/**
 * Jornadas fichadas por persona y día de servicio (un turno de 19:00 a 01:00 es
 * un solo día). Cada uno ve las suyas; las del equipo, quien tiene fichajes_equipo.
 */
export async function clockRecords(actor: Actor, opts: { userId?: string | null; from: string; to: string }) {
  const userId = opts.userId ?? null;
  if (userId && userId !== actor.id) assertCan(actor, "fichajes_equipo", "Sólo Martín puede ver los fichajes de otras personas.");
  else if (!userId && !can(actor, "fichajes_equipo")) return clockRecords(actor, { ...opts, userId: actor.id });
  else assertCan(actor, "fichaje");
  const events = await db.clockEvent.findMany({
    where: {
      ...(userId ? { userId } : {}),
      at: { gte: new Date(toDbDate(opts.from).getTime() - 2 * 3_600_000), lt: new Date(toDbDate(addDays(opts.to, 1)).getTime() + 6 * 3_600_000) },
    },
    include: { user: { select: { name: true, shortName: true } } },
    orderBy: { at: "asc" },
  });
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const day = serviceDayOf(e.at);
    if (day < opts.from || day > opts.to) continue;
    const k = `${day}|${e.userId}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, evs]) => {
      const [date] = k.split("|");
      const first = evs.find((e) => e.type === "ENTRADA");
      const last = [...evs].reverse().find((e) => e.type === "SALIDA");
      const closed = evs.at(-1)?.type === "SALIDA";
      const pauses: string[] = [];
      evs.forEach((e, i) => {
        if (e.type !== "PAUSA_INICIO") return;
        const end = evs.slice(i + 1).find((x) => x.type === "PAUSA_FIN");
        pauses.push(`${timeOf(e.at)}–${end ? timeOf(end.at) : "?"}`);
      });
      const minutes = workedMinutes(evs, closed ? evs.at(-1)!.at : new Date());
      return {
        date,
        name: evs[0].user.name,
        shortName: evs[0].user.shortName,
        entrada: first ? timeOf(first.at) : null,
        salida: last ? timeOf(last.at) : null,
        sinSalida: !closed,
        pausas: pauses,
        minutos: minutes,
        horas: hm(minutes),
        detalle: evs.map((e) => `${LABEL[e.type]} ${timeOf(e.at)}`).join(" · "),
        notas: evs.map((e) => e.note).filter(Boolean).join(" · ") || null,
      };
    });
}
