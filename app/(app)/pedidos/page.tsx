import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listTakeaway, lineText, TK_STATUS_LABEL } from "@/lib/services/takeaway";
import { addDays, isISODate, prettyDate, relativeDay, todayISO, weekdayName } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { formatPhone } from "@/lib/services/customers";
import { AutoRefresh, TakeawayActions } from "./Client";

const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "Nuevos", statuses: ["NUEVO", "CONFIRMADO"] },
  { title: "En preparación", statuses: ["EN_PREPARACION"] },
  { title: "Listos para retirar", statuses: ["LISTO"] },
  { title: "Cerrados", statuses: ["RETIRADO", "CANCELADO"] },
];

export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "takeaway") && !can(user, "produccion")) return <NoAccess title="Para llevar" who="cocina y Martín" />;
  const today = todayISO();
  const d = (await searchParams).d;
  const date = isISODate(d) ? d : today;
  const orders = await listTakeaway(user, date);
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i - 1));
  const pizzas = orders
    .filter((o) => o.status !== "CANCELADO")
    .reduce((s, o) => s + o.lines.filter((l) => l.menuItem?.isPizza).reduce((a, l) => a + l.quantity, 0), 0);

  return (
    <main>
      <AutoRefresh seconds={20} />
      <PageTitle title="Para llevar" />
      <nav className="days" aria-label="Días">
        {days.map((day) => (
          <Link key={day} href={`/pedidos?d=${day}`} className={day === date ? "active" : ""}>
            <span>{day === today ? "hoy" : weekdayName(day).slice(0, 3)}</span>
            <b>{day.slice(8)}</b>
          </Link>
        ))}
      </nav>
      <div className="filete">
        <h2>
          {relativeDay(date) === prettyDate(date) ? prettyDate(date) : relativeDay(date)} · {orders.filter((o) => o.status !== "CANCELADO").length} pedidos · {pizzas} pizzas
        </h2>
      </div>
      {COLUMNS.map((col) => {
        const list = orders.filter((o) => col.statuses.includes(o.status));
        if (!list.length && col.title === "Cerrados") return null;
        return (
          <section key={col.title} style={{ marginBottom: 16 }}>
            <h3 className="col-title">
              {col.title} <span>{list.length}</span>
            </h3>
            <div className="stack">
              {list.length === 0 && <p className="small" style={{ color: "var(--on-dark-muted)", margin: 0 }}>Nada por acá.</p>}
              {list.map((o) => (
                <article key={o.id} className={`card tk-card ${o.status}`}>
                  <div className="row">
                    <span className="order-num">#{o.number}</span>
                    <b className="tk-time">{o.time}</b>
                    <span className="spacer" />
                    <span className={`tag ${o.paymentStatus === "PAGADO" ? "green" : "amber"}`}>
                      {o.paymentStatus === "PAGADO" ? "Pagado" : o.paymentMethod === "ONLINE" ? "Pago online pendiente" : "Paga al retirar"}
                    </span>
                  </div>
                  <ul className="tk-lines">
                    {o.lines.map((l) => (
                      <li key={l.id}>{lineText(l)}</li>
                    ))}
                  </ul>
                  {o.notes && <p className="small" style={{ margin: "4px 0 0" }}><b>Nota:</b> {o.notes}</p>}
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {o.customer.name}
                    {can(user, "takeaway") ? ` · ${formatPhone(o.customer.phone)}` : ""} · {o.total.toFixed(2).replace(".", ",")} € · {TK_STATUS_LABEL[o.status]}
                  </div>
                  <TakeawayActions id={o.id} status={o.status} canDeliver={can(user, "takeaway")} />
                </article>
              ))}
            </div>
          </section>
        );
      })}
      <p className="small" style={{ color: "var(--on-dark-muted)" }}>
        Enlace público para clientes: <b>/pedir</b>
      </p>
    </main>
  );
}
