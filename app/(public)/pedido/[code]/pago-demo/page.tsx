import { notFound } from "next/navigation";
import { paymentsMode } from "@/lib/services/payments";
import { getTakeawayByCode } from "@/lib/services/takeaway";
import { DemoPay } from "./DemoPay";

/** Pasarela simulada para probar el flujo sin Stripe. */
export default async function PagoDemoPage({ params }: { params: Promise<{ code: string }> }) {
  if (paymentsMode() !== "demo") notFound();
  const o = await getTakeawayByCode((await params).code);
  if (!o) notFound();
  return (
    <main>
      <section className="card stack" style={{ textAlign: "center" }}>
        <span className="tag amber" style={{ justifySelf: "center" }}>
          Pago de demostración
        </span>
        <h1 className="public-title">Pagar pedido #{o.number}</h1>
        <p style={{ margin: 0 }}>
          Total: <b>{o.total.toFixed(2).replace(".", ",")} €</b>
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          No se cobra nada. Con Stripe configurado, aquí aparecería la pasarela de pago real.
        </p>
        <DemoPay code={o.code} />
      </section>
    </main>
  );
}
