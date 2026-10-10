import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listNonConformities } from "@/lib/services/sanidad";
import { dateOf, prettyDate, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { CloseNc, NewNc } from "@/components/sanidad/NcClient";

const SOURCE: Record<string, string> = { TEMPERATURA: "Temperatura", RECEPCION: "Recepción", LIMPIEZA: "Limpieza", ELABORACION: "Elaboración", PLAGAS: "Plagas", OTRO: "Otro" };

export default async function IncidenciasPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const list = await listNonConformities(user);
  const canClose = can(user, "sanidad_gestion");
  return (
    <main>
      <PageTitle title="Incidencias" back="/sanidad" />
      <SanidadNav />
      <NewNc />
      <div className="stack" style={{ marginTop: 12 }}>
        {list.length === 0 && <p className="empty">Sin incidencias registradas.</p>}
        {list.map((n) => (
          <article key={n.id} className={`card nc-card ${n.status}`}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow">{SOURCE[n.source] ?? n.source}</div>
                <b>{n.description}</b>
                <div className="small muted">
                  {prettyDate(dateOf(n.createdAt))} {timeOf(n.createdAt)} · {n.createdBy.shortName}
                  {n.viaAi ? " vía Pichuco AI" : ""}
                </div>
                {n.correctiveAction && (
                  <div className="small" style={{ marginTop: 6 }}>
                    <b>Acción correctora:</b> {n.correctiveAction}
                    {n.closedBy ? ` (${n.closedBy.shortName}${n.closedAt ? `, ${prettyDate(dateOf(n.closedAt))}` : ""})` : ""}
                  </div>
                )}
              </div>
              <span className={`tag ${n.status === "ABIERTA" ? "solid-red" : "green"}`}>{n.status === "ABIERTA" ? "Abierta" : "Cerrada"}</span>
            </div>
            {n.status === "ABIERTA" && canClose && <CloseNc id={n.id} />}
          </article>
        ))}
      </div>
    </main>
  );
}
