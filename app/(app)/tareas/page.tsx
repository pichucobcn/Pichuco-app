import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listTasks, KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL, AREA_LABEL } from "@/lib/services/tasks";
import { listTeam } from "@/lib/services/team";
import { fromDbDate, relativeDay, todayISO, addDays } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { TaskCard, type TaskCardData } from "./TaskCard";
import { NewTaskForm } from "./NewTaskForm";
import { QuickAdd } from "./QuickAdd";

const TABS = [
  { id: "hoy", label: "Hoy" },
  { id: "manana", label: "Mañana" },
  { id: "produccion", label: "Producción" },
  { id: "abiertas", label: "Todas abiertas" },
  { id: "hechas", label: "Completadas" },
];

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUserPage();
  const tab = (await searchParams).tab ?? "hoy";
  const today = todayISO();
  const filter =
    tab === "hoy"
      ? { date: today }
      : tab === "manana"
        ? { date: addDays(today, 1) }
        : tab === "produccion"
          ? { kind: "PRODUCCION" as const, status: "ABIERTAS" as const }
          : tab === "hechas"
            ? { status: "COMPLETADA" as const }
            : { status: "ABIERTAS" as const };
  const dayView = tab === "hoy" || tab === "manana";
  const viewDate = tab === "manana" ? addDays(today, 1) : today;
  const [tasks, team, overdue] = await Promise.all([
    listTasks(user, filter),
    listTeam(),
    // Lo que quedó sin terminar de días anteriores aparece en "Hoy"
    tab === "hoy" ? listTasks(user, { status: "ABIERTAS", to: addDays(today, -1) }) : Promise.resolve([]),
  ]);
  const canProduce = can(user, "produccion");
  const canAssign = can(user, "tareas_crear");

  const toCard = (t: (typeof tasks)[number], late = false): TaskCardData => ({
    id: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    kindLabel: KIND_LABEL[t.kind],
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    priority: t.priority,
    priorityLabel: PRIORITY_LABEL[t.priority],
    // En "Hoy"/"Mañana" el día ya se sabe; y no hace falta poner el propio nombre.
    when:
      t.date && !(dayView && !late)
        ? `${relativeDay(fromDbDate(t.date))}${t.dueTime ? ` · antes de las ${t.dueTime}` : ""}`
        : t.dueTime
          ? `antes de las ${t.dueTime}`
          : null,
    who: t.assigneeId === user.id ? null : (t.assignee?.shortName ?? (t.area ? AREA_LABEL[t.area] : null)),
    createdBy: t.createdBy.shortName,
    createdByAi: t.createdByAi,
    comments: t.comments.map((c) => ({ id: c.id, author: c.author.shortName, body: c.body })),
    overdue: late && t.date ? `Pendiente de ${relativeDay(fromDbDate(t.date))}` : null,
  });
  const lateCards = overdue.map((t) => toCard(t, true));
  const all = [...lateCards, ...tasks.map((t) => toCard(t))];
  const pending = all.filter((c) => c.status !== "COMPLETADA");
  const done = all.filter((c) => c.status === "COMPLETADA");
  const cards = dayView ? pending : all;
  const totalDay = tasks.length;
  const doneDay = tasks.filter((t) => t.status === "COMPLETADA").length;

  return (
    <main>
      <PageTitle title="Tareas" />
      <nav className="tabs" aria-label="Filtros">
        {TABS.filter((t) => t.id !== "produccion" || canProduce).map((t) => (
          <Link key={t.id} href={`/tareas?tab=${t.id}`} className={tab === t.id ? "active" : ""}>
            {t.label}
          </Link>
        ))}
      </nav>

      {dayView && totalDay + lateCards.length > 0 && (
        <section className="card progress-card" aria-label="Progreso">
          <div className="nums">
            <span className="big">
              {doneDay} de {totalDay}
            </span>
            <span className="small muted">
              {pending.length === 0 ? "¡Todo hecho!" : `${pending.length === 1 ? "Queda 1" : `Quedan ${pending.length}`}${lateCards.length ? ` (${lateCards.length} de días anteriores)` : ""}`}
            </span>
          </div>
          <div className="progress-bar">
            <i style={{ width: `${totalDay ? Math.round((doneDay / totalDay) * 100) : 0}%` }} />
          </div>
        </section>
      )}

      {dayView && (
        <div style={{ marginTop: 12 }}>
          <QuickAdd date={viewDate} label={tab === "manana" ? "mañana" : "hoy"} />
        </div>
      )}

      <div className="stack" style={{ marginTop: 12 }}>
        {cards.length === 0 && done.length === 0 ? (
          <div className="empty">
            <p>Nada por acá. Agregá una tarea o decile a Pichuco: “Mañana hay que preparar 10 milanesas”.</p>
          </div>
        ) : (
          cards.map((c) => <TaskCard key={c.id} task={c} />)
        )}
        {dayView && done.length > 0 && (
          <>
            <p className="done-sep">Hechas ({done.length})</p>
            {done.map((c) => (
              <TaskCard key={c.id} task={c} />
            ))}
          </>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <NewTaskForm
          canProduce={canProduce}
          canAssign={canAssign}
          team={team.map((u) => ({ id: u.id, name: u.shortName }))}
          defaultKind={tab === "produccion" ? "PRODUCCION" : "GENERAL"}
          today={viewDate}
          label={dayView ? "Más opciones (hora, responsable…)" : undefined}
        />
      </div>
    </main>
  );
}
