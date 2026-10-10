import Stripe from "stripe";
import { ValidationError } from "../permissions";
import type { TakeawayWithRelations } from "./takeaway";

/**
 * Pagos online. Con STRIPE_SECRET_KEY se usa Stripe Checkout; sin clave y con
 * PICHUCO_DEMO_PAYMENTS=1 hay una pantalla de pago simulado para probar.
 */
export function paymentsMode(): "stripe" | "demo" | "off" {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.PICHUCO_DEMO_PAYMENTS === "1") return "demo";
  return "off";
}

function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function startCheckout(order: TakeawayWithRelations, baseUrl: string): Promise<string> {
  const mode = paymentsMode();
  if (mode === "off") throw new ValidationError("El pago online no está disponible.");
  if (mode === "demo") return `${baseUrl}/pedido/${order.code}/pago-demo`;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    currency: "eur",
    line_items: order.lines.map((l) => ({
      quantity: l.quantity,
      price_data: { currency: "eur", unit_amount: Math.round(l.unitPrice * 100), product_data: { name: l.name } },
    })),
    customer_email: order.customer.email ?? undefined,
    metadata: { takeawayCode: order.code },
    success_url: `${baseUrl}/pedido/${order.code}?pago=ok`,
    cancel_url: `${baseUrl}/pedido/${order.code}?pago=cancelado`,
  });
  if (!session.url) throw new Error("Stripe no devolvió la URL de pago");
  return session.url;
}

/** Verifica la firma del webhook y devuelve el código de pedido pagado, si aplica. */
export function parseStripeWebhook(body: string, signature: string | null): { code: string; ref: string } | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new ValidationError("Webhook sin firma.");
  const event = stripe().webhooks.constructEvent(body, signature, secret);
  if (event.type !== "checkout.session.completed") return null;
  const s = event.data.object as Stripe.Checkout.Session;
  if (s.payment_status !== "paid" || !s.metadata?.takeawayCode) return null;
  return { code: s.metadata.takeawayCode, ref: s.id };
}
