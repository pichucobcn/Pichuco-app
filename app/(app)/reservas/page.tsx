import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listReservations, RES_STATUS_LABEL } from "@/lib/services/reservations";
import { getSettings } from "@/lib/services/settings";
import { addDays, isISODate, prettyDate, relativeDay, todayISO, weekdayName } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { formatPhone } from "@/lib/services/customers";
import { ReservationActions, NewReservation } from "./Client";

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "reservas")) return <NoAccess title="Reservas" who="sala y Martín" />;
  const today = todayISO();
  const d = (await searchParams).d;
  const date = isISODate(d) ? d : today;
  const [list, settings] = await Promise.all([listReservations(user, date), getSettings()]);
  const active = list.filter((r) => r.status === "CONFIRMADA" || r.status === "SENTADA");
  const covers = active.reduce((s, r) => s + r.people, 0);
  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i - 1));

  return (
    <main>
      <PageTitle title="Reservas" />
      <nav className="days" aria-label="Días">
        {days.map((day) => (
          <Link key={day} href={`/reservas?d=${day}`} className={day === date ? "active" : ""}>
            <span>{day === today ? "hoy" : weekdayName(day).slice(0, 3)}</span>
            <b>{day.slice(8)}</b>
          </Link>
        ))}
      </nav>
      <div className="filete">
        <h2>{relativeDay(date) === prettyDate(date) ? prettyDate(date) : `${relativeDay(date)} · ${prettyDate(date)}`}</h2>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        <div className="card stat">
          <div className="n">{active.length}</div>
          <div className="l">Reservas</div>
        </div>
        <div className="card stat">
          <div className="n">{covers}</div>
          <div className="l">Comensales</div>
        </div>
        <div className="card stat">
          <div className="n">{settings.coversPerSlot}</div>
          <div className="l">Cupo / franja</div>
        </div>
      </div>
      <NewReservation date={date} />
      <div className="stack" style={{ marginTop: 12 }}>
        {list.length === 0 && <p className="empty">No hay reservas este día.</p>}
        {list.map((r) => (
          <article key={r.id} className={`card res-card ${r.status}`}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span className="res-time">{r.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 17 }}>{r.customer.name}</b>
                <div className="small muted">
                  {r.people} personas · <a href={`tel:${r.customer.phone}`}>{formatPhone(r.customer.phone)}</a>
                  {r.source !== "WEB" ? " · por teléfono" : " · web"}
                </div>
                {r.notes && <div className="small" style={{ marginTop: 4 }}>{r.notes}</div>}
              </div>
              <span className={`tag ${r.status === "SENTADA" ? "green" : r.status === "CONFIRMADA" ? "brown" : "red"}`}>{RES_STATUS_LABEL[r.status]}</span>
            </div>
            <ReservationActions id={r.id} status={r.status} />
          </article>
        ))}
      </div>
      <p className="small" style={{ marginTop: 14, color: "var(--on-dark-muted)" }}>
        Enlace público para clientes: <b>/reservar</b>
      </p>
    </main>
  );
}
