import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { allergenLabel, expiryState, listElaborations, listElaborationTypes, STORAGE_LABEL, ALLERGENS } from "@/lib/services/sanidad";
import { dateOf, prettyDate, relativeDay, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { ElaborationForm, ElaborationActions } from "@/components/sanidad/ElaborationClient";

export default async function EtiquetasPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const [list, types] = await Promise.all([listElaborations(user), listElaborationTypes()]);
  return (
    <main>
      <PageTitle title="Etiquetas" back="/sanidad" />
      <SanidadNav />
      <p className="small" style={{ marginTop: 0, color: "var(--on-dark-muted)" }}>
        Registrá cada elaboración: la app calcula la caducidad, asigna un lote y prepara la etiqueta para imprimir.
      </p>
      <ElaborationForm
        types={types.map((t) => ({ id: t.id, name: t.name, shelfLifeDays: t.shelfLifeDays, storage: t.storage, unit: t.unit, allergens: t.allergens }))}
        allergens={ALLERGENS.map((a) => ({ key: a.key, label: a.label }))}
      />
      <div className="filete">
        <h2>En uso · {list.length}</h2>
      </div>
      <div className="stack">
        {list.length === 0 && <p className="empty">No hay elaboraciones en uso.</p>}
        {list.map((e) => {
          const st = expiryState(e.expiresAt);
          return (
            <article key={e.id} className={`card label-card ${st}`}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 17 }}>{e.name}</b>
                  {e.quantity ? <span className="muted"> · {e.quantity} {e.unit}</span> : null}
                  <div className="small muted">
                    Lote {e.lot} · {prettyDate(dateOf(e.madeAt))} {timeOf(e.madeAt)} · {e.user.shortName}
                  </div>
                  <div className="small muted">{STORAGE_LABEL[e.storage]}{e.allergens.length ? ` · ${e.allergens.map(allergenLabel).join(", ")}` : ""}</div>
                </div>
                <span className={`tag ${st === "caducado" ? "solid-red" : st === "ok" ? "brown" : "amber"}`}>
                  {st === "caducado" ? "Caducado" : `Caduca ${relativeDay(dateOf(e.expiresAt))}`}
                </span>
              </div>
              <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
                <Link className="btn small secondary" href={`/sanidad/etiquetas/${e.id}`}>
                  Etiqueta
                </Link>
                <ElaborationActions id={e.id} expired={st === "caducado"} />
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
