import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { foodSafetyDashboard, FREQ_LABEL } from "@/lib/services/sanidad";
import { dateOf, prettyDate, relativeDay, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";

export default async function SanidadPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const d = await foodSafetyDashboard(user);
  const tempsDone = d.equipment.reduce((s, e) => s + e.done, 0);
  const tempsReq = d.equipment.reduce((s, e) => s + e.required, 0);
  const dailyCleaning = d.cleaning.filter((c) => c.frequency === "DIARIA");
  const dailyDone = dailyCleaning.filter((c) => !c.due).length;
  const allOk = d.pending === 0 && d.cleaningDue.length === 0;

  return (
    <main>
      <PageTitle title="Sanidad" />
      <SanidadNav />

      <section className={`card health-hero ${allOk ? "ok" : ""}`}>
        <div className="eyebrow">Controles de hoy · {prettyDate(d.day)}</div>
        <p className="health-big">{allOk ? "Todo al día" : `${d.pending} ${d.pending === 1 ? "cosa pendiente" : "cosas pendientes"}`}</p>
        <div className="health-grid">
          <Link href="/sanidad/temperaturas" className={tempsDone < tempsReq ? "warn" : "ok"}>
            <b>
              {tempsDone}/{tempsReq}
            </b>
            <span>Temperaturas</span>
          </Link>
          <Link href="/sanidad/limpieza" className={dailyDone < dailyCleaning.length ? "warn" : "ok"}>
            <b>
              {dailyDone}/{dailyCleaning.length}
            </b>
            <span>Limpieza diaria</span>
          </Link>
          <Link href="/sanidad/etiquetas" className={d.expiring.some((e) => e.state === "caducado") ? "bad" : d.expiring.length ? "warn" : "ok"}>
            <b>{d.expiring.length}</b>
            <span>Por caducar</span>
          </Link>
          <Link href="/sanidad/incidencias" className={d.openNcs.length ? "bad" : "ok"}>
            <b>{d.openNcs.length}</b>
            <span>Incidencias</span>
          </Link>
        </div>
      </section>

      {d.tempsPending.length > 0 && (
        <>
          <div className="filete">
            <h2>Temperaturas por tomar</h2>
          </div>
          <div className="card chat-list">
            {d.tempsPending.map((e) => (
              <Link key={e.id} href={`/sanidad/temperaturas#eq-${e.id}`} className="chat-row">
                <div style={{ flex: 1 }}>
                  <b>{e.name}</b>
                  <div className="small muted">
                    {e.nextLabel ?? "Lectura"} · rango {e.minTemp} a {e.maxTemp} °C
                    {e.last ? ` · última ${e.last.value} °C a las ${e.last.time}` : ""}
                  </div>
                </div>
                <span className="tag amber">
                  {e.done}/{e.required}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {d.cleaningDue.length > 0 && (
        <>
          <div className="filete">
            <h2>Limpieza pendiente</h2>
          </div>
          <div className="card chat-list">
            {d.cleaningDue.map((c) => (
              <Link key={c.id} href="/sanidad/limpieza" className="chat-row">
                <div style={{ flex: 1 }}>
                  <b>{c.name}</b>
                  <div className="small muted">
                    {c.area} · {FREQ_LABEL[c.frequency]}
                    {c.last ? ` · última vez ${relativeDay(c.last.day)}` : " · sin registros"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {d.expiring.length > 0 && (
        <>
          <div className="filete">
            <h2>Caducidades</h2>
          </div>
          <div className="card chat-list">
            {d.expiring.map((e) => (
              <Link key={e.id} href="/sanidad/etiquetas" className="chat-row">
                <div style={{ flex: 1 }}>
                  <b>{e.name}</b>
                  <div className="small muted">
                    Lote {e.lot} · caduca {relativeDay(dateOf(e.expiresAt))}
                  </div>
                </div>
                <span className={`tag ${e.state === "caducado" ? "solid-red" : "amber"}`}>{e.state === "caducado" ? "Caducado" : `Caduca ${e.state}`}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {d.openNcs.length > 0 && (
        <>
          <div className="filete">
            <h2>Incidencias abiertas</h2>
          </div>
          <div className="card chat-list">
            {d.openNcs.map((n) => (
              <Link key={n.id} href="/sanidad/incidencias" className="chat-row">
                <div style={{ flex: 1 }}>
                  <b>{n.description}</b>
                  <div className="small muted">
                    {relativeDay(dateOf(n.createdAt))} {timeOf(n.createdAt)} · falta la acción correctora
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {(d.trainingsExpiring.length > 0 || d.pestOverdue) && (
        <>
          <div className="filete">
            <h2>Avisos</h2>
          </div>
          <div className="card stack small">
            {d.trainingsExpiring.map((t) => (
              <div key={t.id}>
                Formación de <b>{t.user.shortName}</b> ({t.title}) {t.expiresAt && t.expiresAt < new Date() ? "vencida" : "vence pronto"}
                {t.expiresAt ? `: ${prettyDate(dateOf(t.expiresAt))}` : ""}.
              </div>
            ))}
            {d.pestOverdue && (
              <div>
                Tocaba visita de control de plagas ({d.pestOverdue.company}) el {prettyDate(dateOf(d.pestOverdue.nextVisit!))}.
              </div>
            )}
          </div>
        </>
      )}

      <p className="small" style={{ marginTop: 16, color: "var(--on-dark-muted)" }}>
        También podés decírselo a Pichuco: “La cámara 1 está a 3 grados”, “Limpié la campana”, “Hice 8 kg de masa”.
      </p>
    </main>
  );
}
