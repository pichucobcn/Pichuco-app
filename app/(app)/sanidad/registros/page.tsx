import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPestVisits, listTrainings } from "@/lib/services/sanidad";
import { listTeam } from "@/lib/services/team";
import { addDays, dateOf, prettyDate, todayISO } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { PestForm, TrainingForm } from "@/components/sanidad/RecordsClient";

const KIND: Record<string, string> = { REVISION: "Revisión", TRATAMIENTO: "Tratamiento", INCIDENCIA: "Incidencia" };

export default async function RegistrosPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const manage = can(user, "sanidad_gestion");
  const [pest, trainings, team] = await Promise.all([listPestVisits(user), listTrainings(user), listTeam()]);
  const today = todayISO();
  return (
    <main>
      <PageTitle title="Más registros" back="/sanidad" />
      <SanidadNav />

      {manage && (
        <section className="card stack">
          <div className="eyebrow">Informe para inspección</div>
          <p className="small muted" style={{ margin: 0 }}>
            Todos los registros de un período, listos para imprimir o descargar en Excel (CSV).
          </p>
          <div className="grid-2">
            <Link className="btn" href={`/sanidad/informe?from=${addDays(today, -30)}&to=${today}`}>
              Últimos 30 días
            </Link>
            <Link className="btn secondary" href="/exportar">
              Exportar (todo el histórico)
            </Link>
          </div>
        </section>
      )}

      <div className="filete">
        <h2>Formación de manipuladores</h2>
      </div>
      <div className="card chat-list">
        {trainings.length === 0 && <p className="empty">Sin certificados cargados.</p>}
        {trainings.map((t) => {
          const exp = t.expiresAt ? dateOf(t.expiresAt) : null;
          const state = !exp ? "brown" : exp < today ? "solid-red" : exp < addDays(today, 60) ? "amber" : "green";
          return (
            <div key={t.id} className="chat-row">
              <div style={{ flex: 1 }}>
                <b>{t.user.name}</b>
                <div className="small muted">
                  {t.title}
                  {t.provider ? ` · ${t.provider}` : ""} · desde {prettyDate(dateOf(t.issuedAt))}
                </div>
              </div>
              <span className={`tag ${state}`}>{exp ? (exp < today ? "Vencido" : `Vence ${prettyDate(exp)}`) : "Sin vencimiento"}</span>
            </div>
          );
        })}
      </div>
      {manage && (
        <div style={{ marginTop: 10 }}>
          <TrainingForm team={team.map((u) => ({ id: u.id, name: u.name }))} />
        </div>
      )}

      <div className="filete">
        <h2>Control de plagas</h2>
      </div>
      <div className="card chat-list">
        {pest.length === 0 && <p className="empty">Sin visitas registradas.</p>}
        {pest.map((p) => (
          <div key={p.id} className="chat-row">
            <div style={{ flex: 1 }}>
              <b>
                {KIND[p.kind]} · {p.company}
              </b>
              <div className="small muted">
                {prettyDate(dateOf(p.date))}
                {p.nextVisit ? ` · próxima: ${prettyDate(dateOf(p.nextVisit))}` : ""}
              </div>
              {p.notes && <div className="small">{p.notes}</div>}
            </div>
          </div>
        ))}
      </div>
      {manage && (
        <div style={{ marginTop: 10 }}>
          <PestForm />
        </div>
      )}
    </main>
  );
}
