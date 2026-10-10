import { NextResponse } from "next/server";
import { parseStripeWebhook } from "@/lib/services/payments";
import { markTakeawayPaid } from "@/lib/services/takeaway";

/** Stripe avisa aquí cuando un pago se completa (firma verificada). */
export async function POST(req: Request) {
  try {
    const paid = parseStripeWebhook(await req.text(), req.headers.get("stripe-signature"));
    if (paid) await markTakeawayPaid(paid.code, paid.ref);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook", (err as Error).message);
    return NextResponse.json({ error: "Webhook inválido" }, { status: 400 });
  }
}
