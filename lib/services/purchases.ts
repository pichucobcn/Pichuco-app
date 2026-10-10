import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { addDays, fromDbDate, isHHMM, isISODate, prettyDate, relativeDay, toDbDate, todayISO } from "../dates";
import { assertCan, can, ForbiddenError, NotFoundError, ValidationError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";
import { notify } from "./notifications";
import { findProduct, fmtEur, fmtQty } from "./stock";
import { findSupplier, nextDeliveryDate } from "./suppliers";
import { areaManagers } from "./team";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  BORRADOR: "Borrador",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  APROBADO: "Aprobado · listo para enviar",
  ENVIADO: "Pedido enviado",
  CONFIRMADO: "Confirmado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

export const STATUS_FLOW: OrderStatus[] = ["BORRADOR", "PENDIENTE_APROBACION", "APROBADO", "ENVIADO", "CONFIRMADO", "ENTREGADO"];

const include = {
  supplier: true,
  lines: { include: { product: true } },
  createdBy: { select: { shortName: true } },
  approvedBy: { select: { shortName: true } },
  events: { include: { user: { select: { shortName: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.PurchaseOrderInclude;

export type OrderWithRelations = Prisma.PurchaseOrderGetPayload<{ include: typeof include }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ───────────── Reglas de aprobación

export async function getPolicy() {
  return (
    (await db.purchasePolicy.findUnique({ where: { id: "default" } })) ??
    (await db.purchasePolicy.create({ data: { id: "default", alwaysApprove: [] } }))
  );
}

export type ApprovalDecision = { level: "AUTO" | "JEFE" | "OBLIGATORIA"; note: string };

/**
 * Decide si un pedido necesita aprobación:
 *  - hasta el límite automático (general o del usuario): se aprueba solo;
 *  - hasta el límite de jefe: lo aprueba el jefe (si lo pide el jefe, queda aprobado);
 *  - por encima, o en categorías sensibles: aprobación obligatoria desde la app.
 */
export async function decideApproval(actor: Actor, total: number, categories: string[]): Promise<ApprovalDecision> {
  const policy = await getPolicy();
  const autoLimit = actor.purchaseAutoLimit ?? policy.autoLimit;
  const sensitive = categories.filter((c) => policy.alwaysApprove.map((x) => x.toLowerCase()).includes(c.toLowerCase()));
  if (total > policy.managerLimit) {
    return { level: "OBLIGATORIA", note: `Supera ${fmtEur(policy.managerLimit)}: aprobación obligatoria desde la app.` };
  }
  if (sensitive.length) {
    return { level: "JEFE", note: `La categoría ${sensitive.join(", ")} siempre requiere aprobación.` };
  }
  if (total <= autoLimit) return { level: "AUTO", note: `Aprobado automáticamente (no supera ${fmtEur(autoLimit)}).` };
  return { level: "JEFE", note: `Entre ${fmtEur(autoLimit)} y ${fmtEur(policy.managerLimit)}: requiere aprobación del jefe.` };
}

async function approvers(exceptId?: string) {
  const users = await db.user.findMany({ where: { active: true } });
  return users.filter((u) => can(u, "compras_aprobar") && u.id !== exceptId);
}

async function addEvent(orderId: string, actor: Actor, text: string, ctx: ActionContext) {
  await db.purchaseOrderEvent.create({ data: { orderId, userId: actor.id, text, viaAi: !!ctx.viaAi } });
}

// ───────────── Consultas

export async function listOrders(actor: Actor, filter: { status?: OrderStatus | "ABIERTOS" } = {}) {
  assertCan(actor, "compras");
  const where: Prisma.PurchaseOrderWhereInput =
    filter.status === "ABIERTOS" ? { status: { notIn: ["ENTREGADO", "CANCELADO"] } } : filter.status ? { status: filter.status } : {};
  return db.purchaseOrder.findMany({ where, include, orderBy: [{ createdAt: "desc" }], take: 60 });
}

export async function getOrder(actor: Actor, idOrNumber: string | number) {
  assertCan(actor, "compras");
  const where = typeof idOrNumber === "number" || /^\d+$/.test(String(idOrNumber)) ? { number: Number(idOrNumber) } : { id: String(idOrNumber) };
  const o = await db.purchaseOrder.findUnique({ where, include });
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  return o;
}

export function orderTitle(o: { number: number; supplier: { name: string } }) {
  return `Pedido #${o.number} · ${o.supplier.name}`;
}

export function orderSummary(o: OrderWithRelations) {
  return o.lines.map((l) => `${fmtQty(l.quantity, l.product.unit)} de ${l.product.name.toLowerCase()}`).join(", ");
}

/** Texto del pedido para enviar al proveedor por WhatsApp o email. */
export function supplierMessage(o: OrderWithRelations) {
  const when = o.deliveryDate ? `${prettyDate(fromDbDate(o.deliveryDate))}${o.deliveryTime ? ` a las ${o.deliveryTime}` : ""}` : "lo antes posible";
  return [
    `Hola${o.supplier.contactName ? " " + o.supplier.contactName : ""}, les escribimos de Pichuco Pizzería Porteña.`,
    `Queríamos hacerles el siguiente pedido (n.º ${o.number}):`,
    ...o.lines.map((l) => `- ${fmtQty(l.quantity, l.product.unit)} de ${l.product.name}`),
    `Entrega: ${when}.`,
    o.notes ? `Nota: ${o.notes}` : "",
    "¿Nos confirman? ¡Gracias!",
  ]
    .filter(Boolean)
    .join("\n");
}

export function supplierLinks(o: OrderWithRelations) {
  const text = supplierMessage(o);
  const wa = (o.supplier.whatsapp ?? o.supplier.phone ?? "").replace(/[^\d]/g, "");
  return {
    text,
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
    email: o.supplier.email
      ? `mailto:${o.supplier.email}?subject=${encodeURIComponent(`Pedido Pichuco n.º ${o.number}`)}&body=${encodeURIComponent(text)}`
      : null,
    phone: o.supplier.phone ? `tel:${o.supplier.phone.replace(/\s/g, "")}` : null,
  };
}

// ───────────── Crear pedido

export const orderInputSchema = z.object({
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().optional(),
        productName: z.string().optional(),
        quantity: z.number().positive().max(100000),
        unitPrice: z.number().min(0).optional(),
      }),
    )
    .min(1),
  deliveryDate: z.string().refine(isISODate, "Fecha YYYY-MM-DD").optional(),
  deliveryTime: z.string().refine(isHHMM, "Hora HH:MM").optional(),
  notes: z.string().max(500).optional(),
});

export async function createOrder(actor: Actor, raw: z.input<typeof orderInputSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "compras", "No tenés permiso para hacer pedidos. Pedile a Gian o a Martín.");
  const input = orderInputSchema.parse(raw);

  // Resolver productos (por id o nombre aproximado)
  const lines = [];
  for (const l of input.lines) {
    const product = l.productId
      ? await db.product.findUnique({ where: { id: l.productId }, include: { supplier: true } })
      : l.productName
        ? await findProduct(l.productName)
        : null;
    if (!product) throw new NotFoundError(`No encuentro el producto "${l.productName ?? l.productId}" en el stock.`);
    lines.push({ product, quantity: l.quantity, unitPrice: l.unitPrice ?? product.lastPrice ?? product.usualPrice ?? 0 });
  }

  // Proveedor: el indicado o el habitual de los productos
  let supplier = input.supplierId
    ? await db.supplier.findUnique({ where: { id: input.supplierId } })
    : input.supplierName
      ? await findSupplier(input.supplierName)
      : null;
  if (!supplier) {
    const ids = [...new Set(lines.map((l) => l.product.supplierId).filter(Boolean))];
    if (ids.length !== 1) throw new ValidationError("Los productos son de proveedores distintos: hacé un pedido por proveedor.");
    supplier = await db.supplier.findUnique({ where: { id: ids[0]! } });
  }
  if (!supplier) throw new NotFoundError("No encuentro el proveedor.");

  const total = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const decision = await decideApproval(actor, total, [...new Set(lines.map((l) => l.product.category))]);
  // El jefe aprueba directamente sus propios pedidos dentro de su margen.
  const selfApproved = decision.level === "JEFE" && can(actor, "compras_aprobar");
  const approved = decision.level === "AUTO" || selfApproved;
  const deliveryDate = input.deliveryDate ?? nextDeliveryDate(supplier.deliveryDays, addDays(todayISO(), 1));
  const minWarning = supplier.minOrder && total < supplier.minOrder ? ` Ojo: el pedido mínimo de ${supplier.name} es ${fmtEur(supplier.minOrder)}.` : "";

  const order = await db.purchaseOrder.create({
    data: {
      supplierId: supplier.id,
      status: approved ? "APROBADO" : "PENDIENTE_APROBACION",
      total,
      approvalNote: (selfApproved ? "Aprobado por quien lo pidió (jefe)." : decision.note) + minWarning,
      deliveryDate: toDbDate(deliveryDate),
      deliveryTime: input.deliveryTime ?? supplier.deliveryTime ?? null,
      notes: input.notes,
      createdById: actor.id,
      createdByAi: !!ctx.viaAi,
      approvedById: selfApproved ? actor.id : null,
      approvedAt: approved ? new Date() : null,
      lines: { create: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice })) },
    },
    include,
  });

  await addEvent(order.id, actor, `Preparó el pedido (${fmtEur(total)}). ${order.approvalNote}`, ctx);
  await audit(actor, "purchase.create", `${orderTitle(order)}: ${orderSummary(order)} — ${fmtEur(total)}. ${order.approvalNote}`, ctx, {
    orderId: order.id,
  });

  if (!approved) {
    const to = await approvers(actor.id);
    await notify(
      to.map((u) => u.id),
      decision.level === "OBLIGATORIA" ? "Compra para aprobar (obligatoria)" : "Compra para aprobar",
      `${actor.shortName} pide ${orderSummary(order)} a ${supplier.name} — ${fmtEur(total)}.`,
      `/compras/${order.number}`,
    );
  }
  return { order, decision, approved };
}

// ───────────── Transiciones

function assertStatus(o: { status: OrderStatus }, allowed: OrderStatus[], action: string) {
  if (!allowed.includes(o.status)) throw new ValidationError(`No se puede ${action}: el pedido está "${STATUS_LABEL[o.status]}".`);
}

export async function approveOrder(actor: Actor, idOrNumber: string | number, ctx: ActionContext = {}) {
  assertCan(actor, "compras_aprobar", "Sólo Martín puede aprobar compras.");
  const o = await getOrder(actor, idOrNumber);
  assertStatus(o, ["PENDIENTE_APROBACION"], "aprobar");
  const policy = await getPolicy();
  if (ctx.viaAi && o.total > policy.managerLimit) {
    throw new ForbiddenError(`Este pedido supera ${fmtEur(policy.managerLimit)}: hay que aprobarlo desde la pantalla del pedido.`);
  }
  const updated = await db.purchaseOrder.update({
    where: { id: o.id },
    data: { status: "APROBADO", approvedById: actor.id, approvedAt: new Date() },
    include,
  });
  await addEvent(o.id, actor, "Aprobó el pedido.", ctx);
  await audit(actor, "purchase.approve", `Aprobó ${orderTitle(o)} (${fmtEur(o.total)})`, ctx, { orderId: o.id });
  if (o.createdById !== actor.id) await notify([o.createdById], "Compra aprobada", `${orderTitle(o)} — ya se puede enviar.`, `/compras/${o.number}`);
  return updated;
}

export async function rejectOrder(actor: Actor, idOrNumber: string | number, reason: string | undefined, ctx: ActionContext = {}) {
  assertCan(actor, "compras_aprobar", "Sólo Martín puede rechazar compras.");
  const o = await getOrder(actor, idOrNumber);
  assertStatus(o, ["PENDIENTE_APROBACION"], "rechazar");
  const updated = await db.purchaseOrder.update({ where: { id: o.id }, data: { status: "CANCELADO" }, include });
  await addEvent(o.id, actor, `Rechazó el pedido${reason ? `: ${reason}` : "."}`, ctx);
  await audit(actor, "purchase.reject", `Rechazó ${orderTitle(o)}${reason ? `: ${reason}` : ""}`, ctx, { orderId: o.id });
  if (o.createdById !== actor.id) await notify([o.createdById], "Compra rechazada", `${orderTitle(o)}${reason ? `: ${reason}` : ""}`, `/compras/${o.number}`);
  return updated;
}

export async function markSent(actor: Actor, idOrNumber: string | number, via: string, ctx: ActionContext = {}) {
  assertCan(actor, "compras");
  const o = await getOrder(actor, idOrNumber);
  assertStatus(o, ["APROBADO"], "enviar");
  const updated = await db.purchaseOrder.update({ where: { id: o.id }, data: { status: "ENVIADO", sentAt: new Date(), sentVia: via }, include });
  await addEvent(o.id, actor, `Envió el pedido al proveedor (${via.toLowerCase()}).`, ctx);
  await audit(actor, "purchase.send", `Envió ${orderTitle(o)} por ${via.toLowerCase()}`, ctx, { orderId: o.id });
  return updated;
}

export const confirmSchema = z.object({
  deliveryDate: z.string().refine(isISODate, "Fecha YYYY-MM-DD"),
  deliveryTime: z.string().refine(isHHMM, "Hora HH:MM"),
  responsibleId: z.string().optional().nullable(),
});

/** El proveedor confirmó: queda la entrega en la Agenda y se avisa a cocina. */
export async function confirmOrder(actor: Actor, idOrNumber: string | number, raw: z.input<typeof confirmSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "compras");
  const input = confirmSchema.parse(raw);
  const o = await getOrder(actor, idOrNumber);
  assertStatus(o, ["ENVIADO", "CONFIRMADO"], "confirmar");
  const title = o.lines.length === 1 ? o.lines[0].product.name : o.supplier.name;
  const eventData = {
    kind: "ENTREGA" as const,
    title,
    date: toDbDate(input.deliveryDate),
    time: input.deliveryTime,
    detail: `${o.supplier.name} — pedido #${o.number}: ${orderSummary(o)}`,
    responsibleId: input.responsibleId ?? null,
  };
  const [updated] = await db.$transaction([
    db.purchaseOrder.update({
      where: { id: o.id },
      data: { status: "CONFIRMADO", confirmedAt: new Date(), deliveryDate: toDbDate(input.deliveryDate), deliveryTime: input.deliveryTime },
      include,
    }),
    db.agendaEvent.upsert({ where: { purchaseOrderId: o.id }, create: { ...eventData, purchaseOrderId: o.id }, update: eventData }),
  ]);
  const when = `${relativeDay(input.deliveryDate)} a las ${input.deliveryTime}`;
  await addEvent(o.id, actor, `Proveedor confirmó. Entrega ${prettyDate(input.deliveryDate)} ${input.deliveryTime}.`, ctx);
  await audit(actor, "purchase.confirm", `${orderTitle(o)} confirmado. Entrega: ${when}`, ctx, { orderId: o.id });
  const cocina = (await areaManagers("COCINA")).map((u) => u.id);
  const recipients = [...cocina, ...(input.responsibleId ? [input.responsibleId] : [])].filter((id) => id !== actor.id);
  await notify(recipients, "Entrega confirmada", `${o.supplier.name} llega ${when}: ${orderSummary(o)}.`, "/agenda");
  return updated;
}

export const receiveSchema = z.object({
  /** Cantidades realmente recibidas por línea; si falta, se asume lo pedido. */
  received: z.record(z.string(), z.number().min(0)).optional(),
  note: z.string().max(300).optional(),
});

/** Recepción: suma al stock, actualiza el último precio y cierra el pedido. */
export async function receiveOrder(actor: Actor, idOrNumber: string | number, raw: z.input<typeof receiveSchema> = {}, ctx: ActionContext = {}) {
  if (!can(actor, "compras") && !can(actor, "stock")) assertCan(actor, "compras");
  const input = receiveSchema.parse(raw);
  const o = await db.purchaseOrder.findFirst({
    where: typeof idOrNumber === "number" || /^\d+$/.test(String(idOrNumber)) ? { number: Number(idOrNumber) } : { id: String(idOrNumber) },
    include,
  });
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  assertStatus(o, ["ENVIADO", "CONFIRMADO"], "recibir");

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const diffs: string[] = [];
  for (const l of o.lines) {
    const qty = input.received?.[l.id] ?? l.quantity;
    if (qty !== l.quantity) diffs.push(`${l.product.name}: llegó ${fmtQty(qty, l.product.unit)} de ${fmtQty(l.quantity, l.product.unit)}`);
    const stockAfter = l.product.stock + qty;
    ops.push(
      db.product.update({ where: { id: l.productId }, data: { stock: { increment: qty }, lastPrice: l.unitPrice } }),
      db.stockMovement.create({
        data: { productId: l.productId, delta: qty, stockAfter, reason: "ENTRADA_PEDIDO", unitPrice: l.unitPrice, userId: actor.id, orderId: o.id },
      }),
    );
  }
  ops.push(db.purchaseOrder.update({ where: { id: o.id }, data: { status: "ENTREGADO", deliveredAt: new Date() } }));
  await db.$transaction(ops);
  const text = `Recibió el pedido y lo sumó al stock.${diffs.length ? " Diferencias: " + diffs.join("; ") + "." : ""}${input.note ? " " + input.note : ""}`;
  await addEvent(o.id, actor, text, ctx);
  await audit(actor, "purchase.receive", `${orderTitle(o)} recibido. ${diffs.join("; ")}`, ctx, { orderId: o.id });
  if (diffs.length) {
    const to = (await approvers(actor.id)).map((u) => u.id);
    await notify(to, "Entrega con diferencias", `${orderTitle(o)}: ${diffs.join("; ")}`, `/compras/${o.number}`);
  }
  return getOrder(actor, o.id);
}

export async function cancelOrder(actor: Actor, idOrNumber: string | number, reason: string | undefined, ctx: ActionContext = {}) {
  assertCan(actor, "compras");
  const o = await getOrder(actor, idOrNumber);
  assertStatus(o, ["BORRADOR", "PENDIENTE_APROBACION", "APROBADO", "ENVIADO", "CONFIRMADO"], "cancelar");
  await db.$transaction([
    db.purchaseOrder.update({ where: { id: o.id }, data: { status: "CANCELADO" } }),
    db.agendaEvent.deleteMany({ where: { purchaseOrderId: o.id } }),
  ]);
  await addEvent(o.id, actor, `Canceló el pedido${reason ? `: ${reason}` : "."}`, ctx);
  await audit(actor, "purchase.cancel", `Canceló ${orderTitle(o)}${reason ? `: ${reason}` : ""}`, ctx, { orderId: o.id });
  return getOrder(actor, o.id);
}

// ───────────── Configuración

export const policySchema = z.object({
  autoLimit: z.number().min(0).max(100000),
  managerLimit: z.number().min(0).max(1000000),
  alwaysApprove: z.array(z.string().trim().min(1).max(50)).max(30),
  userLimits: z.record(z.string(), z.number().min(0).nullable()).optional(),
});

export async function updatePolicy(actor: Actor, raw: z.input<typeof policySchema>, ctx: ActionContext = {}) {
  assertCan(actor, "configuracion");
  const input = policySchema.parse(raw);
  if (input.managerLimit < input.autoLimit) throw new ValidationError("El límite del jefe no puede ser menor que el automático.");
  await db.purchasePolicy.upsert({
    where: { id: "default" },
    create: { id: "default", autoLimit: input.autoLimit, managerLimit: input.managerLimit, alwaysApprove: input.alwaysApprove },
    update: { autoLimit: input.autoLimit, managerLimit: input.managerLimit, alwaysApprove: input.alwaysApprove },
  });
  for (const [userId, limit] of Object.entries(input.userLimits ?? {})) {
    await db.user.update({ where: { id: userId }, data: { purchaseAutoLimit: limit } });
  }
  await audit(
    actor,
    "purchase.policy",
    `Reglas de compra: automático hasta ${fmtEur(input.autoLimit)}, jefe hasta ${fmtEur(input.managerLimit)}${input.alwaysApprove.length ? `, siempre aprobar: ${input.alwaysApprove.join(", ")}` : ""}`,
    ctx,
  );
}
