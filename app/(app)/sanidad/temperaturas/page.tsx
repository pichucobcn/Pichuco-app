import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { equipmentStatus, serviceDayOf } from "@/lib/services/sanidad";
import { addDays, prettyDate, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { TemperatureForm, EquipmentForm } from "@/components/sanidad/TemperatureForm";

export default async function TemperaturasPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const equipment = await equipmentStatus(user);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const history = await db.temperatureLog.findMany({
    where: { at: { gte: since } },
    include: { equipment: true, user: { select: { shortName: true } } },
    orderBy: { at: "desc" },
    take: 120,
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(serviceDayOf(new Date()), -i));

  return (
    <main>
      <PageTitle title="Temperaturas" back="/sanidad" />
      <SanidadNav />
      <div className="stack">
        {equipment.map((e) => (
          <article key={e.id} id={`eq-${e.id}`} className="card">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 17 }}>{e.name}</b>
                <div className="small muted">
                  Rango {e.minTemp} a {e.maxTemp} °C · {e.required} {e.required === 1 ? "lectura" : "lecturas"} al día
                </div>
              </div>
              <span className={`tag ${e.done >= e.required ? "green" : "amber"}`}>
                {e.done}/{e.required} hoy
              </span>
            </div>
            {e.logs.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {e.logs.map((l) => (
                  <span key={l.id} className={`tag ${l.outOfRange ? "solid-red" : "brown"}`}>
                    {l.time} · {l.value} °C · {l.user}
                  </span>
                ))}
              </div>
            )}
            <TemperatureForm equipmentId={e.id} min={e.minTemp} max={e.maxTemp} label={e.nextLabel} />
          </article>
        ))}
      </div>

      {can(user, "sanidad_gestion") && (
        <div style={{ marginTop: 12 }}>
          <EquipmentForm />
        </div>
      )}

      <div className="filete">
        <h2>Últimos 7 días</h2>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="simple">
          <thead>
            <tr>
              <th>Equipo</th>
              {days.map((d) => (
                <th key={d} style={{ textAlign: "center" }}>
                  {prettyDate(d).split(" ")[1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipment.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{e.name}</td>
                {days.map((d) => {
                  const ls = history.filter((h) => h.equipmentId === e.id && serviceDayOf(h.at) === d);
                  return (
                    <td key={d} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      {ls.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        ls.map((l) => (
                          <div key={l.id} title={`${timeOf(l.at)} · ${l.user.shortName}`} style={{ color: l.outOfRange ? "var(--burgundy)" : undefined, fontWeight: l.outOfRange ? 700 : 400 }}>
                            {l.value}°
                          </div>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
