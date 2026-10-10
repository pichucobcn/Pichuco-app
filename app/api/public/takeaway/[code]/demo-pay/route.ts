import { handle } from "@/lib/api";
import { ForbiddenError } from "@/lib/permissions";
import { paymentsMode } from "@/lib/services/payments";
import { markTakeawayPaid } from "@/lib/services/takeaway";

/** Pago simulado: sólo existe en modo demo (sin Stripe configurado). */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ code: string }> }) => {
  if (paymentsMode() !== "demo") throw new ForbiddenError("Pago de demostración desactivado.");
  await markTakeawayPaid((await params).code, "demo");
  return { ok: true };
});
