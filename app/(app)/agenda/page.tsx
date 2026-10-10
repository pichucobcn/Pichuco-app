import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { getSchedule } from "@/lib/services/agenda";
import { addDays, isISODate, todayISO, weekdayName, relativeDay, prettyDate } from "@/lib/dates";
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
      icon: "👥",
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
      icon: "🍕",
      title: t.title,
      sub: `Producción · ${t.status === "COMPLETADA" ? "hecha ✓" : t.status === "EN_CURSO" ? "en curso" : "pendiente"}${t.assignee ? ` · ${t.assignee.shortName}` : ""}`,
      tone: t.status === "COMPLETADA" ? ("green" as const) : undefined,
    })),
    ...s.tasks.map((t) => ({
      time: t.dueTime ?? "—",
      icon: "✅",
      title: t.title,
      sub: `Tarea${t.assignee ? ` · ${t.assignee.shortName}` : ""}${t.status === "COMPLETADA" ? " · hecha ✓" : ""}`,
    })),
    ...s.deliveries.map((e) => ({ time: e.time, icon: "📦", title: `Entrega: ${e.title}`, sub: [e.detail, e.responsible && `Recibe ${e.responsible}`].filter(Boolean).join(" · ") })),
    ...s.reservations.map((e) => ({ time: e.time, icon: "🪑", title: `Reserva ${e.people} personas`, sub: [e.title, e.detail].filter(Boolean).join(" · ") })),
    ...s.takeaway.map((e) => ({ time: e.time, icon: "🥡", title: e.title, sub: e.detail })),
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
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 12 }}>
        {counts.map((c) => (
          <div key={c.label} className="card" style={{ padding: 10, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-poster)", fontSize: 24, color: "var(--burgundy)" }}>{c.n}</div>
            <div className="small muted">{c.label}</div>
          </div>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="empty">Día libre: no hay nada cargado.</p>
      ) : (
        <div className="timeline">
          {items.map((it, i) => (
            <div key={i} className="tl-item">
              <span className="time">{it.time}</span>
              <div className="card row" style={{ padding: 10, borderColor: it.tone === "red" ? "var(--burgundy)" : undefined }}>
                <span className="section-ico" aria-hidden="true">
                  {it.icon}
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
