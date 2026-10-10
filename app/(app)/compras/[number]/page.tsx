import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getOrder, getPolicy, orderTotalLabel, STATUS_FLOW, STATUS_LABEL, supplierLinks, windowText, deliveryContacts } from "@/lib/services/purchases";
import { fmtEur, fmtQty } from "@/lib/services/stock";
import { listTeam } from "@/lib/services/team";
import { formatPhone } from "@/lib/phone";
import { dateOf, fromDbDate, prettyDate, relativeDay, timeOf, todayISO, addDays } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { STATUS_TONE } from "@/components/compras/OrderCard";
import { OrderActions } from "./OrderActions";

/** "mañana (domingo 11/10)" o, si no es hoy/mañana, sólo "martes 13/10". */
function whenLabel(iso: string) {
  const rel = relativeDay(iso);
  return rel === prettyDate(iso) ? rel : `${rel} (${prettyDate(iso)})`;
}

const STEP_LABEL = ["Borrador", "Aprobación", "Aprobado", "Enviado", "Confirmado", "Entregado"];

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "compras")) return <NoAccess title="Compras" who="Gian y Martín" />;
  const { number } = await params;
  if (!/^\d+$/.test(number)) notFound();
  const o = await getOrder(user, Number(number)).catch(() => null);
  if (!o) notFound();
  const [policy, team, contacts] = await Promise.all([getPolicy(), listTeam(), deliveryContacts()]);
  const links = supplierLinks(o);
  const stepIdx = STATUS_FLOW.indexOf(o.status);

  return (
    <main>
      <PageTitle title={`Pedido #${o.number}`} back="/compras" />

      <section className="card stack">
        <div className="row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Proveedor</div>
            <b style={{ fontSize: 18 }}>{o.supplier.name}</b>
          </div>
          <span className={`tag ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
        </div>
        {o.status !== "CANCELADO" && (
          <ol className="stepper" aria-label="Estado del pedido">
            {STEP_LABEL.map((label, i) => (
              <li key={label} className={i < stepIdx ? "done" : i === stepIdx ? "current" : ""}>
                <i />
                <span>{label}</span>
              </li>
            ))}
          </ol>
        )}
        <table className="simple">
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <b>{l.product.name}</b>
                  <div className="small muted">{l.unitPrice ? `${fmtEur(l.unitPrice)}/${l.product.unit}` : "sin precio"}</div>
                </td>
                <td style={{ textAlign: "right" }}>{fmtQty(l.quantity, l.product.unit)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{l.unitPrice ? fmtEur(l.quantity * l.unitPrice) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}>
                <span className="eyebrow">Total estimado</span>
              </td>
              <td style={{ textAlign: "right" }}>
                <b className="order-total">{orderTotalLabel(o)}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="small">
          <div>
            <span className="muted">Entrega: </span>
            {o.deliveryDate ? `${whenLabel(fromDbDate(o.deliveryDate))} ${windowText(o.deliveryTime, o.deliveryTimeTo)}` : "a confirmar"}
          </div>
          <div>
            <span className="muted">Llamar antes a: </span>
            {o.callBefore ? `${o.callBefore.shortName}${o.callBefore.phone ? ` (${formatPhone(o.callBefore.phone)})` : " (sin teléfono cargado)"}` : "nadie"}
          </div>
          {o.approvalNote && (
            <div>
              <span className="muted">Aprobación: </span>
              {o.approvalNote}
              {o.approvedBy && !o.approvalNote.includes("Aprobado por") ? ` Aprobado por ${o.approvedBy.shortName}.` : ""}
            </div>
          )}
          {o.notes && (
            <div>
              <span className="muted">Nota: </span>
              {o.notes}
            </div>
          )}
        </div>
      </section>

      <OrderActions
        order={{
          id: o.id,
          number: o.number,
          status: o.status,
          total: o.total,
          deliveryDate: o.deliveryDate ? fromDbDate(o.deliveryDate) : addDays(todayISO(), 1),
          deliveryTime: o.deliveryTime ?? "",
          deliveryTimeTo: o.deliveryTimeTo ?? "",
          callBeforeId: o.callBeforeId ?? "",
          lines: o.lines.map((l) => ({ id: l.id, name: l.product.name, unit: l.product.unit, quantity: l.quantity })),
        }}
        links={links}
        canApprove={can(user, "compras_aprobar")}
        mandatory={o.total > policy.managerLimit}
        team={team.map((u) => ({ id: u.id, name: u.shortName }))}
        contacts={contacts.map((c) => ({ id: c.id, name: c.shortName }))}
      />

      <div className="filete">
        <h2>Historial</h2>
      </div>
      <div className="card">
        <ul className="timeline-list">
          {o.events.map((e) => (
            <li key={e.id}>
              <span className="small muted">
                {prettyDate(dateOf(e.createdAt))} {timeOf(e.createdAt)} · {e.user.shortName}
                {e.viaAi ? " vía Pichuco AI" : ""}
              </span>
              <div>{e.text}</div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
