import { z } from "zod";
import { db } from "../db";
import { assertCan, can, NotFoundError, ValidationError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";

export const DAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

function assertSuppliers(actor: Actor) {
  if (!can(actor, "proveedores") && !can(actor, "compras")) assertCan(actor, "proveedores");
}

export async function listSuppliers(actor: Actor) {
  assertSuppliers(actor);
  return db.supplier.findMany({
    where: { active: true },
    include: { products: { where: { active: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export async function getSupplier(actor: Actor, id: string) {
  assertSuppliers(actor);
  const s = await db.supplier.findUnique({
    where: { id },
    include: {
      products: { where: { active: true }, orderBy: { name: "asc" } },
      orders: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!s) throw new NotFoundError("Proveedor no encontrado.");
  return s;
}

export async function findSupplier(name: string) {
  const q = normalize(name);
  const all = await db.supplier.findMany({ where: { active: true }, include: { products: true } });
  return (
    all.find((s) => normalize(s.name) === q) ??
    all.find((s) => normalize(s.name).includes(q)) ??
    all.find((s) => s.products.some((p) => normalize(p.name).includes(q) || normalize(p.category) === q)) ??
    null
  );
}

/** Próximo día de reparto del proveedor a partir de una fecha (incluida). */
export function nextDeliveryDate(deliveryDays: number[], fromISO: string): string {
  if (!deliveryDays.length) return fromISO;
  for (let i = 0; i < 8; i++) {
    const d = new Date(fromISO + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    if (deliveryDays.includes(d.getUTCDay())) return d.toISOString().slice(0, 10);
  }
  return fromISO;
}

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  contactName: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  whatsapp: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  hours: z.string().max(100).optional().nullable(),
  deliveryDays: z.array(z.number().int().min(0).max(6)).default([]),
  deliveryTime: z.string().max(10).optional().nullable(),
  deliveryTimeTo: z.string().max(10).optional().nullable(),
  minOrder: z.number().min(0).optional().nullable(),
  conditions: z.string().max(500).optional().nullable(),
  channel: z.enum(["WHATSAPP", "EMAIL", "TELEFONO"]).default("WHATSAPP"),
  notes: z.string().max(1000).optional().nullable(),
});

export async function saveSupplier(actor: Actor, id: string | null, raw: z.input<typeof supplierSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "proveedores");
  const data = supplierSchema.parse(raw);
  if (data.deliveryTime && data.deliveryTimeTo && data.deliveryTimeTo <= data.deliveryTime)
    throw new ValidationError("La hora de fin del reparto tiene que ser posterior a la de inicio.");
  const s = id ? await db.supplier.update({ where: { id }, data }) : await db.supplier.create({ data });
  await audit(actor, id ? "supplier.update" : "supplier.create", `Proveedor ${id ? "actualizado" : "creado"}: ${s.name}`, ctx, { supplierId: s.id });
  return s;
}
