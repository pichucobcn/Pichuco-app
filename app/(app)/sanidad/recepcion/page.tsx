import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listReceptions } from "@/lib/services/sanidad";
import { dateOf, prettyDate, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { ReceptionForm } from "@/components/sanidad/ReceptionForm";

export default async function RecepcionPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const [list, suppliers] = await Promise.all([listReceptions(user), db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } })]);
  return (
    <main>
      <PageTitle title="Recepción" back="/sanidad" />
      <SanidadNav />
      <ReceptionForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      <div className="filete">
        <h2>Últimas recepciones</h2>
      </div>
      <div className="card chat-list">
        {list.length === 0 && <p className="empty">Todavía no hay recepciones registradas.</p>}
        {list.map((r) => (
          <div key={r.id} className="chat-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{r.product}</b>
              <div className="small muted">
                {r.supplierName} · {prettyDate(dateOf(r.at))} {timeOf(r.at)} · {r.user.shortName}
                {r.temperature != null ? ` · ${r.temperature} °C` : ""}
                {r.lot ? ` · lote ${r.lot}` : ""}
                {r.expiryDate ? ` · cad. ${prettyDate(dateOf(r.expiryDate))}` : ""}
              </div>
              {r.notes && <div className="small">{r.notes}</div>}
            </div>
            <span className={`tag ${r.accepted && r.packagingOk && r.labelOk ? "green" : "solid-red"}`}>{r.accepted ? (r.packagingOk && r.labelOk ? "Correcta" : "Con defectos") : "Rechazada"}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
