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
};

const NEXT: Record<string, string> = { PENDIENTE: "EN_CURSO", EN_CURSO: "COMPLETADA", COMPLETADA: "PENDIENTE" };
const NEXT_LABEL: Record<string, string> = { PENDIENTE: "Empezar", EN_CURSO: "Terminar", COMPLETADA: "Reabrir" };

export function TaskCard({ task }: { task: TaskCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const done = task.status === "COMPLETADA";

  async function setStatus(status: string) {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/tasks/${task.id}`, { status }, "PATCH");
      router.refresh();
    } catch (e) {
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
    <article className={`card task ${done ? "done" : ""}`}>
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
          {task.kind !== "GENERAL" && <span className="tag brown">{task.kindLabel}</span>}
          <span className={`tag ${task.status === "EN_CURSO" ? "amber" : task.status === "COMPLETADA" ? "green" : "brown"}`}>{task.statusLabel}</span>
          {task.priority === "ALTA" && !done && <span className="tag solid-red">Prioridad alta</span>}
          {task.when && <span className="tag brown">{task.when}</span>}
          {task.who && <span className="tag brown">{task.who}</span>}
          {task.createdByAi && <span className="tag ai">Pichuco AI</span>}
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
        {!done && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" disabled={busy} onClick={() => setStatus(NEXT[task.status])}>
              {NEXT_LABEL[task.status]}
            </button>
            {!open && (
              <button className="btn small secondary" onClick={() => setOpen(true)}>
                Detalle{task.comments.length ? ` (${task.comments.length})` : ""}
              </button>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </article>
  );
}
