import { notFound } from "next/navigation";
import { getTakeawayByCode, lineText, TK_FLOW, TK_STATUS_LABEL } from "@/lib/services/takeaway";
import { fromDbDate, prettyDate } from "@/lib/dates";
import { CancelButton } from "@/components/public/CancelButton";
import { PayButton } from "./PayButton";

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ pago?: string }> }) {
  const o = await getTakeawayByCode((await params).code);
  if (!o) notFound();
  const pago = (await searchParams).pago;
  const idx = TK_FLOW.indexOf(o.status);
  const pendingPay = o.paymentMethod === "ONLINE" && o.paymentStatus === "PENDIENTE" && o.status !== "CANCELADO";
  return (
    <main>
      <section className="poster public-poster">
        <img src="/brand/pichuco.png" alt="" className="mascot" style={{ width: 140 }} />
        <h1 className="public-title">
          {o.status === "CANCELADO" ? "Pedido cancelado" : o.status === "LISTO" ? "¡Tu pedido está listo!" : `Pedido #${o.number}`}
        </h1>
        <div className="confirm-box">
          <div>
            <span className="eyebrow">Retiro</span>
            <b>{prettyDate(fromDbDate(o.date))}</b>
          </div>
          <div>
            <span className="eyebrow">Hora</span>
            <b>{o.time}</b>
          </div>
          <div>
            <span className="eyebrow">Total</span>
            <b>{eur(o.total)}</b>
          </div>
        </div>
        {o.status !== "CANCELADO" && (
          <ol className="stepper" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginTop: 14 }}>
            {TK_FLOW.map((s, i) => (
              <li key={s} className={i < idx ? "done" : i === idx ? "current" : ""}>
                <i />
                <span>{TK_STATUS_LABEL[s]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pago === "ok" && o.paymentStatus !== "PAGADO" && <p className="card small">Estamos confirmando tu pago. Recargá la página en unos segundos.</p>}
      {pago === "cancelado" && pendingPay && <p className="card small">El pago no se completó. Podés intentarlo de nuevo o pagar al retirar llamándonos.</p>}

      <section className="card" style={{ marginTop: 12 }}>
        <table className="simple">
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id}>
                <td>{lineText(l)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(l.unitPrice * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Pago: {o.paymentMethod === "ONLINE" ? "online" : "al retirar"} · {o.paymentStatus === "PAGADO" ? "pagado" : "pendiente"} · Código {o.code}
        </p>
      </section>

      {pendingPay && <PayButton code={o.code} total={eur(o.total)} />}
      {["NUEVO", "CONFIRMADO"].includes(o.status) && o.paymentStatus !== "PAGADO" && (
        <CancelButton url={`/api/public/takeaway/${o.code}/cancel`} label="Cancelar pedido" confirm="¿Seguro que querés cancelar el pedido?" />
      )}
      <p className="small" style={{ textAlign: "center", marginTop: 12, color: "var(--on-dark-muted)" }}>
        Guardá esta página para ver cómo va tu pedido.
      </p>
    </main>
  );
}
