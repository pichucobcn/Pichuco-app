"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export type TaskCardData = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  kindLabel: string;
  status: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  when: string | null;
  who: string | null;
  createdBy: string;
  createdByAi: boolean;
  comments: { id: string; author: string; body: string }[];
  /** De un día anterior y sin terminar. */
  overdue?: string | null;
};


export function TaskCard({ task }: { task: TaskCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const status = optimistic ?? task.status;
  const done = status === "COMPLETADA";

  async function setStatus(next: string) {
    setBusy(true);
    setError(undefined);
    setOptimistic(next);
    try {
      await api(`/api/tasks/${task.id}`, { status: next }, "PATCH");
      router.refresh();
    } catch (e) {
      setOptimistic(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/comments`, { body: comment });
      setComment("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card task ${done ? "done" : ""} ${task.overdue && !done ? "overdue" : ""}`}>
      <button
        className="check"
        aria-label={done ? "Marcar como pendiente" : "Marcar como completada"}
        disabled={busy}
        onClick={() => setStatus(done ? "PENDIENTE" : "COMPLETADA")}
      >
        {done && <Icon name="check" size={20} stroke={3} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={`title ${task.kind === "PRODUCCION" ? "prod-title" : ""}`} onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
          {task.title}
        </div>
        <div className="meta">
          {task.overdue && !done && <span className="tag red">{task.overdue}</span>}
          {task.kind !== "GENERAL" && task.kind !== "PRODUCCION" && <span className="tag brown">{task.kindLabel}</span>}
          {status === "EN_CURSO" && <span className="tag amber">En curso</span>}
          {task.priority === "ALTA" && !done && <span className="tag solid-red">Prioridad alta</span>}
          {task.when && <span className="tag brown">{task.when}</span>}
          {task.who && <span className="tag brown">{task.who}</span>}
          {task.comments.length > 0 && <span className="tag brown">{task.comments.length} coment.</span>}
        </div>
        {open && (
          <div className="stack" style={{ marginTop: 10 }}>
            {task.description && <p style={{ margin: 0 }}>{task.description}</p>}
            <p className="small muted" style={{ margin: 0 }}>
              Creada por {task.createdBy}
              {task.createdByAi ? " a través de Pichuco AI" : ""}
            </p>
            {task.comments.map((c) => (
              <p key={c.id} className="small" style={{ margin: 0 }}>
                <b>{c.author}:</b> {c.body}
              </p>
            ))}
            <div className="row">
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario…" maxLength={1000} />
              <button className="btn small secondary" disabled={busy || !comment.trim()} onClick={sendComment}>
                Enviar
              </button>
            </div>
          </div>
        )}
        {open && !done && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small secondary" disabled={busy} onClick={() => setStatus(status === "EN_CURSO" ? "PENDIENTE" : "EN_CURSO")}>
              {status === "EN_CURSO" ? "Volver a pendiente" : "Marcar en curso"}
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </article>
  );
}
