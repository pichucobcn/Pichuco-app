import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cleaningStatus, FREQ_LABEL } from "@/lib/services/sanidad";
import { relativeDay } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { CleaningDone, CleaningItemForm } from "@/components/sanidad/CleaningClient";

export default async function LimpiezaPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const items = await cleaningStatus(user);
  return (
    <main>
      <PageTitle title="Limpieza" back="/sanidad" />
      <SanidadNav />
      {(["DIARIA", "SEMANAL", "MENSUAL"] as const).map((freq) => {
        const list = items.filter((i) => i.frequency === freq);
        if (!list.length) return null;
        const done = list.filter((i) => !i.due).length;
        return (
          <section key={freq}>
            <div className="filete">
              <h2>
                {FREQ_LABEL[freq]} · {done}/{list.length}
              </h2>
            </div>
            <div className="stack">
              {list.map((i) => (
                <article key={i.id} className={`card task ${i.due ? "" : "done"}`}>
                  <CleaningDone id={i.id} done={!i.due} name={i.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{i.name}</div>
                    <div className="small muted">
                      {i.area}
                      {i.method ? ` · ${i.method}` : ""}
                    </div>
                    <div className="small muted" style={{ marginTop: 2 }}>
                      {i.last ? `Última: ${relativeDay(i.last.day)} ${i.last.time} · ${i.last.user}` : "Sin registros"}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {can(user, "sanidad_gestion") && (
        <div style={{ marginTop: 14 }}>
          <CleaningItemForm />
        </div>
      )}
    </main>
  );
}
