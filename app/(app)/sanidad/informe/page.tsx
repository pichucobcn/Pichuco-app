import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { allergenLabel, foodSafetyReport } from "@/lib/services/sanidad";
import { addDays, dateOf, isISODate, prettyDate, timeOf, todayISO } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { PrintButton } from "@/components/sanidad/PrintButton";

export default async function InformePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "sanidad_gestion")) return <NoAccess title="Informe" who="Gian y Martín" />;
  const sp = await searchParams;
  const to = isISODate(sp.to) ? sp.to : todayISO();
  const from = isISODate(sp.from) ? sp.from : addDays(to, -30);
  const r = await foodSafetyReport(user, from, to);
  const out = r.temps.filter((t) => t.outOfRange).length;
  return (
    <main className="report">
      <div className="no-print">
        <PageTitle title="Informe APPCC" back="/sanidad/registros" />
        <form className="card row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" type="date" name="from" defaultValue={from} style={{ maxWidth: 160 }} />
          <input className="input" type="date" name="to" defaultValue={to} style={{ maxWidth: 160 }} />
          <button className="btn small">Ver</button>
          <a className="btn small secondary" href={`/api/sanidad/export?from=${from}&to=${to}`}>
            CSV
          </a>
        </form>
      </div>
      <section className="card report-sheet" style={{ marginTop: 12 }}>
        <h2 className="display-sm">Pichuco Pizzería Porteña — Registros de autocontrol (APPCC)</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Del {prettyDate(from)} al {prettyDate(to)} · {r.temps.length} temperaturas ({out} fuera de rango) · {r.cleaning.length} limpiezas · {r.receptions.length} recepciones · {r.elaborations.length} elaboraciones · {r.ncs.length} incidencias
        </p>

        <h3 className="report-h">Temperaturas</h3>
        <table className="simple">
          <thead>
            <tr><th>Fecha</th><th>Equipo</th><th>°C</th><th>Resultado / acción</th><th>Resp.</th></tr>
          </thead>
          <tbody>
            {r.temps.map((t) => (
              <tr key={t.id}>
                <td>{dateOf(t.at)} {timeOf(t.at)}</td>
                <td>{t.equipment.name}</td>
                <td>{t.value}</td>
                <td>{t.outOfRange ? `Fuera de rango (${t.equipment.minTemp} a ${t.equipment.maxTemp}). ${t.correctiveAction ?? ""}` : "Correcto"}</td>
                <td>{t.user.shortName}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="report-h">Limpieza y desinfección</h3>
        <table className="simple">
          <thead>
            <tr><th>Fecha</th><th>Elemento</th><th>Zona</th><th>Resp.</th></tr>
          </thead>
          <tbody>
            {r.cleaning.map((c) => (
              <tr key={c.id}>
                <td>{dateOf(c.at)} {timeOf(c.at)}</td>
                <td>{c.item.name}</td>
                <td>{c.item.area}</td>
                <td>{c.user.shortName}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="report-h">Recepción de mercancías</h3>
        <table className="simple">
          <thead>
            <tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>°C</th><th>Lote / cad.</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            {r.receptions.map((x) => (
              <tr key={x.id}>
                <td>{dateOf(x.at)}</td>
                <td>{x.product}</td>
                <td>{x.supplierName}</td>
                <td>{x.temperature ?? "—"}</td>
                <td>{[x.lot, x.expiryDate ? dateOf(x.expiryDate) : null].filter(Boolean).join(" / ") || "—"}</td>
                <td>{x.accepted ? (x.packagingOk && x.labelOk ? "Aceptada" : "Aceptada con defectos") : `Rechazada. ${x.notes ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="report-h">Elaboraciones (trazabilidad)</h3>
        <table className="simple">
          <thead>
            <tr><th>Lote</th><th>Producto</th><th>Elaborado</th><th>Caduca</th><th>Alérgenos</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {r.elaborations.map((e) => (
              <tr key={e.id}>
                <td>{e.lot}</td>
                <td>{e.name}</td>
                <td>{dateOf(e.madeAt)}</td>
                <td>{dateOf(e.expiresAt)}</td>
                <td>{e.allergens.map(allergenLabel).join(", ") || "—"}</td>
                <td>{e.status === "EN_USO" ? "En uso" : e.status === "CONSUMIDO" ? "Consumido" : `Desechado (${e.discardReason})`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="report-h">Incidencias y acciones correctoras</h3>
        <table className="simple">
          <thead>
            <tr><th>Fecha</th><th>Descripción</th><th>Acción correctora</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {r.ncs.map((n) => (
              <tr key={n.id}>
                <td>{dateOf(n.createdAt)}</td>
                <td>{n.description}</td>
                <td>{n.correctiveAction ?? "—"}</td>
                <td>{n.status === "ABIERTA" ? "Abierta" : `Cerrada${n.closedBy ? ` (${n.closedBy.shortName})` : ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="report-h">Control de plagas</h3>
        <table className="simple">
          <tbody>
            {r.pest.map((p) => (
              <tr key={p.id}>
                <td>{dateOf(p.date)}</td>
                <td>{p.company}</td>
                <td>{p.kind}</td>
                <td>{p.notes ?? ""}</td>
              </tr>
            ))}
            {r.pest.length === 0 && (
              <tr>
                <td className="muted">Sin visitas en el período.</td>
              </tr>
            )}
          </tbody>
        </table>

        <h3 className="report-h">Formación de manipuladores</h3>
        <table className="simple">
          <tbody>
            {r.trainings.map((t) => (
              <tr key={t.id}>
                <td>{t.user.name}</td>
                <td>{t.title}</td>
                <td>{dateOf(t.issuedAt)}</td>
                <td>{t.expiresAt ? `vence ${dateOf(t.expiresAt)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="no-print" style={{ marginTop: 12 }}>
        <PrintButton label="Imprimir / guardar en PDF" />
      </div>
    </main>
  );
}
