import { z } from "zod";
import { db } from "../db";
import { assertCan, NotFoundError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Cantidad legible: "4 kg", "12 u.", "2,5 l". */
export function fmtQty(n: number, unit: string) {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${v} ${unit}`;
}

export function fmtEur(n: number) {
  return `€${n.toFixed(2).replace(".", ",")}`;
}

export function isLow(p: { stock: number; minStock: number }) {
  return p.minStock > 0 && p.stock < p.minStock;
}

/** Cuánto pedir para quedar holgado: hasta el doble del mínimo. */
export function suggestedQuantity(p: { stock: number; minStock: number }) {
  return Math.max(0, Math.ceil(p.minStock * 2 - p.stock));
}

export async function listProducts(actor: Actor) {
  assertCan(actor, "stock");
  return db.product.findMany({
    where: { active: true },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function lowStock(actor: Actor) {
  return (await listProducts(actor)).filter(isLow);
}

/** Busca un producto por nombre aproximado ("mozza", "harina 00"). */
export async function findProduct(name: string) {
  const q = normalize(name).replace(/s$/, "");
  const products = await db.product.findMany({ where: { active: true }, include: { supplier: true } });
  return (
    products.find((p) => normalize(p.name) === q) ??
    products.find((p) => normalize(p.name).startsWith(q)) ??
    products.find((p) => normalize(p.name).includes(q)) ??
    products.find((p) => q.includes(normalize(p.name).split(" ")[0])) ??
    null
  );
}

export async function getProduct(actor: Actor, id: string) {
  assertCan(actor, "stock");
  const p = await db.product.findUnique({
    where: { id },
    include: {
      supplier: true,
      movements: { include: { user: { select: { shortName: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!p) throw new NotFoundError("Producto no encontrado.");
  return p;
}

export const adjustSchema = z.object({
  /** Stock contado (recuento) o, si `delta` viene, variación. */
  stock: z.number().min(0).optional(),
  delta: z.number().optional(),
  reason: z.enum(["AJUSTE", "CONSUMO", "MERMA"]).default("AJUSTE"),
  note: z.string().max(300).optional(),
});

export async function adjustStock(actor: Actor, productId: string, raw: z.input<typeof adjustSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "stock");
  const input = adjustSchema.parse(raw);
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p) throw new NotFoundError("Producto no encontrado.");
  const newStock = Math.max(0, input.stock ?? p.stock + (input.delta ?? 0));
  const delta = newStock - p.stock;
  await db.$transaction([
    db.product.update({ where: { id: p.id }, data: { stock: newStock } }),
    db.stockMovement.create({
      data: { productId: p.id, delta, stockAfter: newStock, reason: input.reason, note: input.note, userId: actor.id },
    }),
  ]);
  await audit(actor, "stock.adjust", `Stock de ${p.name}: ${fmtQty(p.stock, p.unit)} → ${fmtQty(newStock, p.unit)}`, ctx, { productId: p.id });
  return { ...p, stock: newStock };
}

export const productSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  unit: z.string().trim().min(1).max(20),
  stock: z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
  supplierId: z.string().optional().nullable(),
  usualPrice: z.number().min(0).optional().nullable(),
});

export async function createProduct(actor: Actor, raw: z.input<typeof productSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "stock");
  const input = productSchema.parse(raw);
  const p = await db.product.create({ data: { ...input, lastPrice: input.usualPrice ?? null } });
  await audit(actor, "product.create", `Producto creado: ${p.name}`, ctx, { productId: p.id });
  return p;
}
