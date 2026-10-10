import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPhone, getCustomer } from "@/lib/services/customers";
import { RES_STATUS_LABEL } from "@/lib/services/reservations";
import { TK_STATUS_LABEL, takeawaySummary } from "@/lib/services/takeaway";
import { dateOf, fromDbDate, prettyDate } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { CustomerTools } from "./CustomerTools";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "clientes")) return <NoAccess title="Clientes" who="Martín" />;
  const c = await getCustomer(user, (await params).id);
  const spent = c.takeawayOrders.filter((o) => o.status !== "CANCELADO").reduce((s, o) => s + o.total, 0);
  return (
    <main>
      <PageTitle title={c.name} back="/clientes" />
      <section className="card stack">
        <div className="small">
          <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>
          {c.email ? ` · ${c.email}` : ""}
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <span className="tag brown">{c.reservations.length} reservas</span>
          <span className="tag brown">{c.takeawayOrders.length} pedidos · {spent.toFixed(2).replace(".", ",")} €</span>
          {c.marketingConsent && <span className="tag green">Acepta novedades</span>}
          <span className="tag brown">Cliente desde {prettyDate(dateOf(c.createdAt))}</span>
        </div>
        <CustomerTools id={c.id} notes={c.notes ?? ""} />
      </section>
      {c.reservations.length > 0 && (
        <>
          <div className="filete">
            <h2>Reservas</h2>
          </div>
          <div className="card">
            <table className="simple">
              <tbody>
                {c.reservations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {prettyDate(fromDbDate(r.date))} {r.time}
                    </td>
                    <td>{r.people} p.</td>
                    <td style={{ textAlign: "right" }}>{RES_STATUS_LABEL[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {c.takeawayOrders.length > 0 && (
        <>
          <div className="filete">
            <h2>Pedidos para llevar</h2>
          </div>
          <div className="card">
            <table className="simple">
              <tbody>
                {c.takeawayOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      #{o.number} · {prettyDate(fromDbDate(o.date))}
                      <div className="small muted">{takeawaySummary(o)}</div>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {o.total.toFixed(2).replace(".", ",")} €<div className="small muted">{TK_STATUS_LABEL[o.status]}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
