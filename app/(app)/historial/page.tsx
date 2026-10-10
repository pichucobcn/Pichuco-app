import { requireUserPage } from "@/lib/auth";
import { listAudit } from "@/lib/services/audit";
import { dateOf, prettyDate, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";

export default async function HistorialPage() {
  const user = await requireUserPage();
  const logs = await listAudit(user, 100);
  return (
    <main>
      <PageTitle title="Historial" back="/equipo" />
      <p className="small muted">Todo lo que se hizo en la app, incluido lo que hizo Pichuco AI y a partir de qué mensaje.</p>
      <div className="stack">
        {logs.length === 0 && <p className="empty">Todavía no hay acciones registradas.</p>}
        {logs.map((l) => (
          <article key={l.id} className="card">
            <div className="row small muted">
              <span>
                {prettyDate(dateOf(l.createdAt))} — {timeOf(l.createdAt)}
              </span>
              <span className="spacer" />
              {l.viaAi && <span className="tag ai">✦ Pichuco AI</span>}
            </div>
            {l.input && (
              <p style={{ margin: "6px 0" }}>
                <b>{l.actor.shortName}</b> escribió: <i>“{l.input}”</i>
              </p>
            )}
            <p style={{ margin: "4px 0 0" }}>
              {l.viaAi ? "• " : <b>{l.actor.shortName}: </b>}
              {l.summary}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
