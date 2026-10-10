import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { assertCan, can } from "@/lib/permissions";
import { getSchedule } from "@/lib/services/agenda";
import { addDays, isISODate, todayISO, weekdayName, relativeDay, prettyDate } from "@/lib/dates";
import { Icon } from "@/components/Icon";
import { PageTitle } from "@/components/PageTitle";

type Item = { time: string; icon: string; title: string; sub?: string | null; tone?: "red" | "green" | "amber" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUserPage();
  assertCan(user, "agenda");
  const today = todayISO();
  const d = (await searchParams).d;
  const date = isISODate(d) ? d : today;
  const s = await getSchedule(user, date);

  const items: Item[] = [
    ...s.staff.map((p) => ({
      time: p.absent ? p.start : p.effectiveStart,
      icon: "users",
      title: p.absent ? `${p.name} — no viene` : `Entra ${p.name}`,
      sub: p.absent
        ? `Turno ${p.start}–${p.end}${p.reason ? ` · ${p.reason}` : ""}`
        : p.delayMinutes
          ? `Llega ${p.delayMinutes}' tarde (turno ${p.start}–${p.end})${p.reason ? ` · ${p.reason}` : ""}`
          : `Turno ${p.start}–${p.end}`,
      tone: p.absent || p.delayMinutes ? ("red" as const) : undefined,
    })),
    ...s.production.map((t) => ({
      time: t.dueTime ?? "—",
      icon: "pizza",
      title: t.title,
      sub: `Producción · ${t.status === "COMPLETADA" ? "hecha" : t.status === "EN_CURSO" ? "en curso" : "pendiente"}${t.assignee ? ` · ${t.assignee.shortName}` : ""}`,
      tone: t.status === "COMPLETADA" ? ("green" as const) : undefined,
    })),
    ...s.tasks.map((t) => ({
      time: t.dueTime ?? "—",
      icon: "tasks",
      title: t.title,
      sub: `Tarea${t.assignee ? ` · ${t.assignee.shortName}` : ""}${t.status === "COMPLETADA" ? " · hecha" : ""}`,
    })),
    ...s.deliveries.map((e) => ({ time: e.time, icon: "truck", title: `Entrega: ${e.title}`, sub: [e.detail, e.responsible && `Recibe ${e.responsible}`].filter(Boolean).join(" · ") })),
    ...s.reservations.map((e) => ({ time: e.time, icon: "table", title: `Reserva ${e.people} personas`, sub: [e.title, e.detail].filter(Boolean).join(" · ") })),
    ...s.takeaway.map((e) => ({ time: e.time, icon: "bag", title: e.title, sub: e.detail })),
  ].sort((a, b) => (a.time === "—" ? 1 : b.time === "—" ? -1 : a.time.localeCompare(b.time)));

  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i - 1));
  const counts = [
    { label: "Personal", n: s.staff.filter((p) => !p.absent).length },
    { label: "Reservas", n: s.reservations.length },
    { label: "Comensales", n: s.reservations.reduce((a, r) => a + (r.people ?? 0), 0) },
    { label: "Para llevar", n: s.takeaway.length },
  ];

  return (
    <main>
      <PageTitle title="Agenda" />
      <nav className="days" aria-label="Días">
        {days.map((day) => (
          <Link key={day} href={`/agenda?d=${day}`} className={day === date ? "active" : ""}>
            <span>{day === today ? "hoy" : weekdayName(day).slice(0, 3)}</span>
            <b>{day.slice(8)}</b>
          </Link>
        ))}
      </nav>
      <div className="filete">
        <h2>{relativeDay(date) === prettyDate(date) ? prettyDate(date) : `${relativeDay(date)} · ${prettyDate(date)}`}</h2>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {counts.map((c) => (
          <div key={c.label} className="card stat">
            <div className="n">{c.n}</div>
            <div className="l">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {can(user, "reservas") && (
          <Link href={`/reservas?d=${date}`} className="btn small secondary">
            Ver reservas
          </Link>
        )}
        {(can(user, "takeaway") || can(user, "produccion")) && (
          <Link href={`/pedidos?d=${date}`} className="btn small secondary">
            Ver pedidos para llevar
          </Link>
        )}
      </div>
      {s.demand && (s.demand.covers > 0 || s.demand.takeawayPizzas > 0) && (
        <div className={`card demand ${s.demand.extraKg > 0 ? "warn" : ""}`} style={{ marginBottom: 12 }}>
          <div className="eyebrow">Demanda prevista</div>
          <p style={{ margin: "4px 0 0" }}>{s.demand.message}</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="empty">Día libre: no hay nada cargado.</p>
      ) : (
        <div className="timeline">
          {items.map((it, i) => (
            <div key={i} className="tl-item">
              <span className="time">{it.time}</span>
              <div className="card row" style={{ padding: "10px 12px", borderColor: it.tone === "red" ? "var(--burgundy)" : undefined, background: it.tone === "red" ? "#fff3ea" : undefined }}>
                <span className="section-ico" aria-hidden="true">
                  <Icon name={it.icon} size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{it.title}</b>
                  {it.sub && <div className="small muted">{it.sub}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
