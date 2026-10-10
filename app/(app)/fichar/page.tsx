import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { currentJourney, myHistory, teamClock } from "@/lib/services/clock";
import { shiftFor } from "@/lib/services/team";
import { nowHHMM, prettyDate, timeOf, todayISO } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { ClockButtons } from "./ClockButtons";

const fmt = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;

export default async function FicharPage() {
  const user = await requireUserPage();
  const today = todayISO();
  const [journey, history, shift, team] = await Promise.all([
    currentJourney(user),
    myHistory(user, 14),
    shiftFor(user.id, today),
    can(user, "fichajes_equipo") ? teamClock(user, today) : Promise.resolve(null),
  ]);
  const stateClass = journey.state === "en pausa" ? "pausa" : journey.state;

  return (
    <main>
      <PageTitle title="Fichar" />
      <section className="card clock-face">
        <div className="now">{nowHHMM()}</div>
        <div className="muted small">{prettyDate(today)}{shift ? ` · Turno ${shift.start}–${shift.end}` : " · Sin turno hoy"}</div>
        <span className={`clock-state ${stateClass}`}>{journey.state === "fuera" ? "Fuera de turno" : journey.state === "en pausa" ? "En pausa" : "Trabajando"}</span>
        {journey.events.length > 0 && (
          <p className="small" style={{ marginBottom: 0 }}>
            Jornada: <b>{fmt(journey.worked)}</b> · {journey.events.map((e) => `${e.type === "ENTRADA" ? "Entrada" : e.type === "SALIDA" ? "Salida" : e.type === "PAUSA_INICIO" ? "Pausa" : "Vuelta"} ${timeOf(e.at)}`).join(" · ")}
          </p>
        )}
      </section>

      <ClockButtons allowed={journey.allowed} />

      <div className="filete">
        <h2>Mi histórico</h2>
      </div>
      {history.length === 0 ? (
        <p className="empty">Todavía no hay fichajes.</p>
      ) : (
        <div className="card">
          <table className="simple">
            <thead>
              <tr>
                <th>Día</th>
                <th>Fichajes</th>
                <th>Horas</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.date}>
                  <td>{prettyDate(d.date)}</td>
                  <td>{d.events.map((e) => `${e.label} ${e.time}`).join(" · ")}</td>
                  <td>{fmt(d.worked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {team && (
        <>
          <div className="filete">
            <h2>Equipo hoy</h2>
          </div>
          <div className="card">
            <table className="simple">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Fichajes</th>
                  <th>Horas</th>
                </tr>
              </thead>
              <tbody>
                {team.map((t) => (
                  <tr key={t.user.id}>
                    <td>
                      <b>{t.user.shortName}</b>
                      {t.incidents.map((i) => (
                        <div key={i.id} className="small" style={{ color: "var(--burgundy)" }}>
                          {i.type === "RETRASO" ? `Retraso ${i.minutes}'` : "Ausencia"}
                          {i.reason ? ` · ${i.reason}` : ""}
                        </div>
                      ))}
                    </td>
                    <td>{t.events.length ? t.events.map((e) => `${e.label} ${e.time}`).join(" · ") : <span className="muted">—</span>}</td>
                    <td>{fmt(t.worked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginBottom: 0 }}>Exportación para gestoría: próximamente.</p>
          </div>
        </>
      )}
    </main>
  );
}
