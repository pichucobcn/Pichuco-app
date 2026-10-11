import { z } from "zod";
import { db } from "../db";
import { assertCan, NotFoundError, ValidationError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/mozzarella|mozarella|muzarella|muzza\b/g, "muzzarella")
    .replace(/coca[\s-]?cola/g, "coca-cola")
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

const STOP = new Set(["de", "del", "la", "el", "los", "las", "al", "a", "y", "con", "para", "kg", "kilos", "kilo"]);
const words = (s: string) =>
  normalize(s)
    .split(/[^a-z0-9ñ-]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d/.test(w))
    .map((w) => w.replace(/(?<=[a-z]{3})(es|s)$/, ""));
const wordMatch = (a: string, b: string) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

/**
 * Busca un producto por nombre aproximado ("mozza", "queso merkapizza", "harina 00").
 * Si el texto nombra un proveedor ("queso merkapizza") o viene `supplierId`, busca
 * sólo entre sus productos. Si hay varios igual de probables, no adivina: lanza un
 * error con las opciones.
 */
export async function findProduct(name: string, opts: { supplierId?: string | null } = {}) {
  let text = normalize(name);
  const all = await db.product.findMany({ where: { active: true }, include: { supplier: true } });

  // ¿Nombra un proveedor? ("queso merkapizza", "salsa de kimon")
  let supplierId = opts.supplierId ?? null;
  const suppliers = [...new Map(all.filter((p) => p.supplier).map((p) => [p.supplier!.id, p.supplier!])).values()];
  for (const s of suppliers) {
    const sn = normalize(s.name);
    const re = new RegExp(`\\b(?:de |a |al |en )?${sn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(text)) {
      text = text.replace(re, " ").replace(/\s+/g, " ").trim();
      supplierId ??= s.id;
    }
  }
  const pool = supplierId && all.some((p) => p.supplierId === supplierId) ? all.filter((p) => p.supplierId === supplierId) : all;
  const q = text.replace(/s$/, "");
  if (!q) return pool.length === 1 ? pool[0] : null;

  const exact = pool.find((p) => normalize(p.name) === q || normalize(p.name) === text);
  if (exact) return exact;

  const qw = words(text);
  const scored = pool
    .map((p) => {
      const pw = words(p.name);
      const hits = qw.filter((w) => pw.some((x) => wordMatch(w, x))).length;
      const covered = pw.filter((x) => qw.some((w) => wordMatch(w, x))).length;
      const prefix = normalize(p.name).startsWith(q) ? 1 : 0;
      return { p, hits, covered, extra: pw.length - covered, prefix };
    })
    .filter((x) => x.hits > 0 || x.prefix);
  if (!scored.length) return null;
  scored.sort((a, b) => b.hits - a.hits || b.prefix - a.prefix || a.extra - b.extra);
  const top = scored.filter((x) => x.hits === scored[0].hits && x.prefix === scored[0].prefix);
  // Un único candidato, o uno solo cuyo nombre queda cubierto por completo: sin dudas.
  if (top.length === 1) return top[0].p;
  const full = top.filter((x) => x.extra === 0);
  if (full.length === 1) return full[0].p;
  const options = scored
    .filter((x) => x.hits === scored[0].hits)
    .slice(0, 6)
    .map((x) => `${x.p.name}${x.p.supplier ? ` (${x.p.supplier.name})` : ""}`);
  throw new ValidationError(`Hay varios productos que encajan con “${name.trim()}”: ${options.join(", ")}. ¿Cuál?`);
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

export const productUpdateSchema = productSchema.omit({ stock: true }).extend({
  minStock: z.number().min(0),
  usualPrice: z.number().min(0).optional().nullable(),
});

/** Editar ficha: nombre, categoría, unidad, mínimo, precio habitual y proveedor. */
export async function updateProduct(actor: Actor, id: string, raw: z.input<typeof productUpdateSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "stock");
  const input = productUpdateSchema.parse(raw);
  const before = await db.product.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("Producto no encontrado.");
  const p = await db.product.update({
    where: { id },
    data: {
      ...input,
      supplierId: input.supplierId || null,
      // Si todavía no había último precio, el habitual sirve de referencia.
      lastPrice: before.lastPrice ?? input.usualPrice ?? null,
    },
  });
  await audit(actor, "product.update", `Producto actualizado: ${p.name} (mínimo ${fmtQty(p.minStock, p.unit)}${p.usualPrice != null ? `, precio ${fmtEur(p.usualPrice)}/${p.unit}` : ""})`, ctx, { productId: p.id });
  return p;
}

export async function createProduct(actor: Actor, raw: z.input<typeof productSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "stock");
  const input = productSchema.parse(raw);
  const p = await db.product.create({ data: { ...input, lastPrice: input.usualPrice ?? null } });
  await audit(actor, "product.create", `Producto creado: ${p.name}`, ctx, { productId: p.id });
  return p;
}
