import { handle } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/permissions";
import { baseUrl, guardPublic } from "@/lib/public-api";
import { startCheckout } from "@/lib/services/payments";
import { getTakeawayByCode } from "@/lib/services/takeaway";

/** Reintentar el pago online de un pedido pendiente. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ code: string }> }) => {
  const blocked = guardPublic(req, null, "pagar", 10);
  if (blocked) return blocked;
  const o = await getTakeawayByCode((await params).code);
  if (!o) throw new NotFoundError("Pedido no encontrado.");
  if (o.paymentMethod !== "ONLINE" || o.paymentStatus !== "PENDIENTE" || o.status === "CANCELADO") throw new ValidationError("Este pedido no tiene un pago pendiente.");
  return { payUrl: await startCheckout(o, baseUrl(req)) };
});
