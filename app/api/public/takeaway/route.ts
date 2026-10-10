import { handle } from "@/lib/api";
import { baseUrl, guardPublic } from "@/lib/public-api";
import { startCheckout } from "@/lib/services/payments";
import { createPublicTakeaway } from "@/lib/services/takeaway";

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const blocked = guardPublic(req, body, "pedido");
  if (blocked) return blocked;
  const order = await createPublicTakeaway(body ?? {});
  const payUrl = order.paymentMethod === "ONLINE" ? await startCheckout(order, baseUrl(req)) : null;
  return { code: order.code, payUrl };
});
