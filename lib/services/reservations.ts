import type { ReservationStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { fromDbDate, isHHMM, isISODate, prettyDate, relativeDay, toDbDate } from "../dates";
import { assertCan, can, ForbiddenError, NotFoundError, ValidationError } from "../permissions";
import { audit } from "./audit";
import { reservationSlots } from "./availability";
import { publicCode } from "./codes";
import type { Actor, ActionContext } from "./context";
import { contactSchema, upsertCustomer } from "./customers";
import { notify } from "./notifications";

export const RES_STATUS_LABEL: Record<ReservationStatus, string> = {
  CONFIRMADA: "Confirmada",
  SENTADA: "Sentada",
  NO_SHOW: "No vino",
  CANCELADA: "Cancelada",
};

/** Reserva grande: se avisa a sala y al jefe. */
const BIG_PARTY = 8;

export const reservationSchema = contactSchema.extend({
  date: z.string().refine(isISODate, "Fecha no válida"),
  time: z.string().refine(isHHMM, "Hora no válida"),
  people: z.number().int().min(1).max(40),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  privacy: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

async function notifyNewReservation(r: { date: Date; time: string; people: number; customer: { name: string } }, exceptId?: string) {
  if (r.people < BIG_PARTY) return;
  const users = await db.user.findMany({ where: { active: true } });
  const to = users.filter((u) => can(u, "reservas") && u.id !== exceptId).map((u) => u.id);
  await notify(to, "Reserva importante", `${r.customer.name}: ${r.people} personas, ${relativeDay(fromDbDate(r.date))} a las ${r.time}.`, "/reservas?d=" + fromDbDate(r.date));
}

/** Reserva desde la web pública. Se confirma sola si hay sitio. */
export async function createPublicReservation(raw: z.input<typeof reservationSchema>) {
  const input = reservationSchema.parse(raw);
  if (!input.privacy) throw new ValidationError("Tenés que aceptar la política de privacidad.");
  const { closed, slots, settings } = await reservationSlots(input.date, input.people);
  if (closed) throw new ValidationError(closed);
  if (input.people > settings!.maxPartyOnline)
    throw new ValidationError(`Para más de ${settings!.maxPartyOnline} personas llamanos al ${settings!.phone}.`);
  const slot = slots.find((s) => s.time === input.time);
  if (!slot?.available) throw new ValidationError("Ese horario ya no está disponible. Elegí otro, por favor.");
  const customer = await upsertCustomer({ ...input, privacy: true });
  const r = await db.reservation.create({
    data: { code: publicCode(), customerId: customer.id, date: toDbDate(input.date), time: input.time, people: input.people, notes: input.notes || null, source: "WEB" },
    include: { customer: true },
  });
  await notifyNewReservation(r);
  return r;
}

/** Reserva cargada por el equipo (teléfono, en persona o por Pichuco AI). */
export async function createStaffReservation(actor: Actor, raw: z.input<typeof reservationSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "reservas");
  const input = reservationSchema.parse(raw);
  const { closed, slots, settings } = await reservationSlots(input.date, 1);
  if (closed) throw new ValidationError(closed);
  const slot = slots.find((s) => s.time === input.time);
  if (!slot) throw new ValidationError("Ese horario está fuera del servicio.");
  const over = slot.free < input.people;
  const customer = await upsertCustomer(input);
  const r = await db.reservation.create({
    data: {
      code: publicCode(),
      customerId: customer.id,
      date: toDbDate(input.date),
      time: input.time,
      people: input.people,
      notes: input.notes || null,
      source: "TELEFONO",
      createdById: actor.id,
    },
    include: { customer: true },
  });
  await audit(actor, "reservation.create", `Reserva: ${customer.name}, ${input.people} personas, ${prettyDate(input.date)} ${input.time}${over ? ` (supera el cupo de ${settings!.coversPerSlot})` : ""}`, ctx, { reservationId: r.id });
  await notifyNewReservation(r, actor.id);
  return { reservation: r, overCapacity: over };
}

export async function listReservations(actor: Actor, date: string) {
  if (!can(actor, "reservas") && !can(actor, "agenda")) assertCan(actor, "reservas");
  return db.reservation.findMany({
    where: { date: toDbDate(date) },
    include: { customer: true },
    orderBy: [{ time: "asc" }, { createdAt: "asc" }],
  });
}

export async function setReservationStatus(actor: Actor, id: string, status: ReservationStatus, ctx: ActionContext = {}) {
  assertCan(actor, "reservas");
  const r = await db.reservation.findUnique({ where: { id }, include: { customer: true } });
  if (!r) throw new NotFoundError("Reserva no encontrada.");
  const updated = await db.reservation.update({ where: { id }, data: { status } });
  await audit(actor, "reservation.status", `Reserva de ${r.customer.name} (${r.time}): ${RES_STATUS_LABEL[status]}`, ctx, { reservationId: id });
  return updated;
}

// ───────────── Acceso público por código

export async function getReservationByCode(code: string) {
  return db.reservation.findUnique({ where: { code: code.toUpperCase() }, include: { customer: { select: { name: true } } } });
}

export async function cancelReservationByCode(code: string) {
  const r = await getReservationByCode(code);
  if (!r) throw new NotFoundError("Reserva no encontrada.");
  if (r.status !== "CONFIRMADA") throw new ForbiddenError("Esta reserva ya no se puede cancelar online.");
  const updated = await db.reservation.update({ where: { id: r.id }, data: { status: "CANCELADA" } });
  if (r.people >= BIG_PARTY) {
    const users = await db.user.findMany({ where: { active: true } });
    await notify(users.filter((u) => can(u, "reservas")).map((u) => u.id), "Reserva cancelada", `${r.customer.name} canceló (${r.people} personas, ${relativeDay(fromDbDate(r.date))} ${r.time}).`, "/reservas");
  }
  return updated;
}
