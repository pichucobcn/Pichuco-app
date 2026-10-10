import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listTasks, KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL, AREA_LABEL } from "@/lib/services/tasks";
import { listTeam } from "@/lib/services/team";
import { fromDbDate, relativeDay, todayISO, addDays } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { TaskCard, type TaskCardData } from "./TaskCard";
import { NewTaskForm } from "./NewTaskForm";

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
  const [tasks, team] = await Promise.all([listTasks(user, filter), listTeam()]);
  const canProduce = can(user, "produccion");
  const canAssign = can(user, "tareas_crear");

  const cards: TaskCardData[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    kindLabel: KIND_LABEL[t.kind],
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    priority: t.priority,
    priorityLabel: PRIORITY_LABEL[t.priority],
    when: t.date ? `${relativeDay(fromDbDate(t.date))}${t.dueTime ? ` · antes de las ${t.dueTime}` : ""}` : t.dueTime ? `antes de las ${t.dueTime}` : null,
    who: t.assignee?.shortName ?? (t.area ? AREA_LABEL[t.area] : null),
    createdBy: t.createdBy.shortName,
    createdByAi: t.createdByAi,
    comments: t.comments.map((c) => ({ id: c.id, author: c.author.shortName, body: c.body })),
  }));

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

      <NewTaskForm
        canProduce={canProduce}
        canAssign={canAssign}
        team={team.map((u) => ({ id: u.id, name: u.shortName }))}
        defaultKind={tab === "produccion" ? "PRODUCCION" : "GENERAL"}
        today={today}
      />

      <div className="stack" style={{ marginTop: 12 }}>
        {cards.length === 0 ? (
          <div className="empty">
            <img src="/brand/pichuco.svg" alt="" />
            <p>Nada por acá. Podés crear una tarea o decirle a Pichuco: “Mañana hay que preparar 10 milanesas”.</p>
          </div>
        ) : (
          cards.map((c) => <TaskCard key={c.id} task={c} />)
        )}
      </div>
    </main>
  );
}
