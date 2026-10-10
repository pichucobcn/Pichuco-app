import { z } from "zod";
import { db } from "../db";
import { assertCan, NotFoundError, ValidationError } from "../permissions";
import type { Actor } from "./context";

/** "+34 600 11 22 33" → "+34600112233"; números de 9 cifras se asumen españoles. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const plain = digits.replace(/^00/, "+");
  if (/^[6789]\d{8}$/.test(plain)) return "+34" + plain;
  return plain;
}

/** "+34611000007" → "+34 611 00 00 07" para mostrar. */
export function formatPhone(phone: string) {
  const m = phone.match(/^\+34(\d{3})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+34 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export function isValidPhone(raw: string) {
  return /^\+?\d{9,15}$/.test(normalizePhone(raw));
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Decinos tu nombre").max(80),
  phone: z.string().trim().refine(isValidPhone, "Teléfono no válido"),
  email: z.string().trim().email("Email no válido").max(120).optional().or(z.literal("")),
});

/** Crea o actualiza el cliente por teléfono. */
export async function upsertCustomer(input: { name: string; phone: string; email?: string | null; privacy?: boolean; marketing?: boolean }) {
  const phone = normalizePhone(input.phone);
  if (!isValidPhone(phone)) throw new ValidationError("Teléfono no válido.");
  const email = input.email ? input.email.trim() : null;
  return db.customer.upsert({
    where: { phone },
    create: {
      name: input.name.trim(),
      phone,
      email,
      privacyAcceptedAt: input.privacy ? new Date() : null,
      marketingConsent: !!input.marketing,
    },
    update: {
      name: input.name.trim(),
      ...(email ? { email } : {}),
      ...(input.privacy ? { privacyAcceptedAt: new Date() } : {}),
      ...(input.marketing !== undefined ? { marketingConsent: input.marketing } : {}),
    },
  });
}

export async function listCustomers(actor: Actor, q?: string) {
  assertCan(actor, "clientes");
  const query = q?.trim();
  return db.customer.findMany({
    where: query
      ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query.replace(/\s/g, "") } }, { email: { contains: query, mode: "insensitive" } }] }
      : {},
    include: { _count: { select: { reservations: true, takeawayOrders: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getCustomer(actor: Actor, id: string) {
  assertCan(actor, "clientes");
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      reservations: { orderBy: { date: "desc" }, take: 20 },
      takeawayOrders: { orderBy: { date: "desc" }, take: 20, include: { lines: true } },
    },
  });
  if (!c) throw new NotFoundError("Cliente no encontrado.");
  return c;
}

export async function updateCustomerNotes(actor: Actor, id: string, notes: string) {
  assertCan(actor, "clientes");
  return db.customer.update({ where: { id }, data: { notes: z.string().max(1000).parse(notes) || null } });
}

/** Derecho de supresión (RGPD): anonimiza al cliente conservando el historial operativo. */
export async function anonymizeCustomer(actor: Actor, id: string) {
  assertCan(actor, "clientes");
  return db.customer.update({
    where: { id },
    data: { name: "Cliente eliminado", phone: `borrado-${id}`, email: null, notes: null, marketingConsent: false },
  });
}
