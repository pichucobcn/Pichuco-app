import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { anonymizeCustomer, updateCustomerNotes } from "@/lib/services/customers";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { notes } = z.object({ notes: z.string() }).parse(await req.json());
  await updateCustomerNotes(await requireUser(), (await params).id, notes);
  return { ok: true };
});

/** Supresión de datos personales a pedido del cliente (RGPD). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await anonymizeCustomer(await requireUser(), (await params).id);
  return { ok: true };
});
