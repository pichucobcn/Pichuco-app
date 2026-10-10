import type { Prisma, TakeawayStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { fromDbDate, isHHMM, isISODate, relativeDay, toDbDate } from "../dates";
import { can, ForbiddenError, NotFoundError, ValidationError } from "../permissions";
import { audit } from "./audit";
import { takeawaySlots } from "./availability";
import { publicCode } from "./codes";
import type { Actor, ActionContext } from "./context";
import { contactSchema, upsertCustomer } from "./customers";
import { notify } from "./notifications";

export const TK_STATUS_LABEL: Record<TakeawayStatus, string> = {
  NUEVO: "Nuevo",
  CONFIRMADO: "Confirmado",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  RETIRADO: "Retirado",
  CANCELADO: "Cancelado",
};
export const TK_FLOW: TakeawayStatus[] = ["NUEVO", "CONFIRMADO", "EN_PREPARACION", "LISTO", "RETIRADO"];

export type Extra = { name: string; price: number };

const include = { customer: true, lines: { include: { menuItem: true } } } satisfies Prisma.TakeawayOrderInclude;
export type TakeawayWithRelations = Prisma.TakeawayOrderGetPayload<{ include: typeof include }>;

export async function getMenu() {
  const [items, extras] = await Promise.all([
    db.menuItem.findMany({ where: { available: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    db.menuExtra.findMany({ where: { available: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
  ]);
  return { items, extras };
}

export function lineText(l: { quantity: number; name: string; extras: Prisma.JsonValue | null }) {
  const ex = ((l.extras as Extra[] | null) ?? []).map((e) => e.name.toLowerCase());
  return `${l.quantity} × ${l.name}${ex.length ? ` (${ex.join(", ")})` : ""}`;
}

export function takeawaySummary(o: { lines: { quantity: number; name: string; extras: Prisma.JsonValue | null }[] }) {
  return o.lines.map(lineText).join(", ");
}

export const takeawaySchema = contactSchema.extend({
  date: z.string().refine(isISODate, "Fecha no válida"),
  time: z.string().refine(isHHMM, "Hora no válida"),
  items: z
    .array(z.object({ menuItemId: z.string(), quantity: z.number().int().min(1).max(30), extraIds: z.array(z.string()).max(6).default([]) }))
    .min(1, "Elegí al menos un producto")
    .max(30),
  paymentMethod: z.enum(["ONLINE", "AL_RECOGER"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  privacy: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

/** Pedido desde la web. Los precios se calculan siempre en el servidor. */
export async function createPublicTakeaway(raw: z.input<typeof takeawaySchema>) {
  const input = takeawaySchema.parse(raw);
  if (!input.privacy) throw new ValidationError("Tenés que aceptar la política de privacidad.");
  const { items, extras } = await getMenu();
  const lines = input.items.map((i) => {
    const item = items.find((m) => m.id === i.menuItemId);
    if (!item) throw new ValidationError("Algún producto ya no está disponible.");
    const chosen = i.extraIds.map((id) => {
      const e = extras.find((x) => x.id === id);
      if (!e) throw new ValidationError("Algún extra ya no está disponible.");
      return { name: e.name, price: e.price };
    });
    if (chosen.length && !item.isPizza) throw new ValidationError("Los extras son sólo para pizzas.");
    return { item, quantity: i.quantity, extras: chosen, unitPrice: item.price + chosen.reduce((s, e) => s + e.price, 0) };
  });
  const pizzas = lines.filter((l) => l.item.isPizza).reduce((s, l) => s + l.quantity, 0);
  const { closed, slots, settings } = await takeawaySlots(input.date, Math.max(1, pizzas));
  if (closed) throw new ValidationError(closed);
  if (!slots.find((s) => s.time === input.time)?.available) throw new ValidationError("Ese horario ya está completo. Elegí otro, por favor.");
  if (input.paymentMethod === "ONLINE" && !settings!.onlinePayments) throw new ValidationError("El pago online no está disponible ahora.");

  const customer = await upsertCustomer({ ...input, privacy: true });
  const total = Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
  const order = await db.takeawayOrder.create({
    data: {
      code: publicCode(),
      customerId: customer.id,
      date: toDbDate(input.date),
      time: input.time,
      paymentMethod: input.paymentMethod,
      total,
      notes: input.notes || null,
      lines: {
        create: lines.map((l) => ({
          menuItemId: l.item.id,
          name: l.item.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          extras: l.extras.length ? l.extras : undefined,
        })),
      },
    },
    include,
  });
  // Pago al retirar: aviso inmediato. Pago online: se avisa al confirmarse el pago.
  if (order.paymentMethod === "AL_RECOGER") await notifyKitchen(order);
  return order;
}

async function notifyKitchen(o: TakeawayWithRelations) {
  const users = await db.user.findMany({ where: { active: true } });
  const to = users.filter((u) => u.role === "JEFE_COCINA" || can(u, "takeaway")).map((u) => u.id);
  await notify(
    to,
    `Pedido para llevar #${o.number}`,
    `${relativeDay(fromDbDate(o.date))} ${o.time} · ${takeawaySummary(o)}${o.paymentStatus === "PAGADO" ? " · pagado" : ""}`,
    "/pedidos?d=" + fromDbDate(o.date),
  );
}

function assertBoard(actor: Actor) {
  if (!can(actor, "takeaway") && !can(actor, "produccion")) throw new ForbiddenError("No tenés acceso a los pedidos para llevar.");
}

export async function listTakeaway(actor: Actor, date: string) {
  assertBoard(actor);
  return db.takeawayOrder.findMany({ where: { date: toDbDate(date) }, include, orderBy: [{ time: "asc" }, { number: "asc" }] });
}

export async function getTakeaway(actor: Actor, id: string) {
  assertBoard(actor);
  const o = await db.takeawayOrder.findUnique({ where: { id }, include });
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  return o;
}

/** Cocina puede avanzar hasta "Listo"; entregar y cobrar es de quien gestiona pedidos. */
export async function setTakeawayStatus(actor: Actor, idOrNumber: string | number, status: TakeawayStatus, ctx: ActionContext = {}) {
  assertBoard(actor);
  const where = typeof idOrNumber === "number" || /^\d+$/.test(String(idOrNumber)) ? { number: Number(idOrNumber) } : { id: String(idOrNumber) };
  const o = await db.takeawayOrder.findUnique({ where, include });
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  if ((status === "RETIRADO" || status === "CANCELADO") && !can(actor, "takeaway")) {
    throw new ForbiddenError("Entregar o cancelar pedidos lo hace sala o Martín.");
  }
  if (o.status === "RETIRADO" || o.status === "CANCELADO") throw new ValidationError("Ese pedido ya está cerrado.");
  const data: Prisma.TakeawayOrderUpdateInput = { status };
  // Al retirar con pago en local, se da por cobrado.
  if (status === "RETIRADO" && o.paymentMethod === "AL_RECOGER") data.paymentStatus = "PAGADO";
  const updated = await db.takeawayOrder.update({ where: { id: o.id }, data, include });
  await audit(actor, "takeaway.status", `Pedido #${o.number}: ${TK_STATUS_LABEL[status]}`, ctx, { takeawayId: o.id });
  return updated;
}

// ───────────── Acceso público y pagos

export async function getTakeawayByCode(code: string) {
  return db.takeawayOrder.findUnique({ where: { code: code.toUpperCase() }, include });
}

/** Marca un pedido como pagado (webhook de Stripe o pago de demostración). Idempotente. */
export async function markTakeawayPaid(code: string, ref: string) {
  const o = await getTakeawayByCode(code);
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  if (o.paymentStatus === "PAGADO") return o;
  const updated = await db.takeawayOrder.update({
    where: { id: o.id },
    data: { paymentStatus: "PAGADO", paymentRef: ref, status: o.status === "NUEVO" ? "CONFIRMADO" : o.status },
    include,
  });
  await notifyKitchen(updated);
  return updated;
}

export async function cancelTakeawayByCode(code: string) {
  const o = await getTakeawayByCode(code);
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  if (!["NUEVO", "CONFIRMADO"].includes(o.status)) throw new ForbiddenError("Ya lo estamos preparando: llamanos si necesitás cambiarlo.");
  if (o.paymentStatus === "PAGADO") throw new ForbiddenError("El pedido ya está pagado: llamanos para cancelarlo y te devolvemos el dinero.");
  const updated = await db.takeawayOrder.update({ where: { id: o.id }, data: { status: "CANCELADO" } });
  const users = await db.user.findMany({ where: { active: true } });
  await notify(users.filter((u) => u.role === "JEFE_COCINA" || can(u, "takeaway")).map((u) => u.id), `Pedido #${o.number} cancelado`, `El cliente canceló el pedido de las ${o.time}.`, "/pedidos");
  return updated;
}
