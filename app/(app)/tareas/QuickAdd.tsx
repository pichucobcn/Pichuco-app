"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

/** Agregar una tarea en una línea para el día que se está mirando (hoy o mañana). */
export function QuickAdd({ date, label }: { date: string; label: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="stack"
      style={{ gap: 6 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        setError(undefined);
        try {
          await api("/api/tasks", { title: title.trim(), date });
          setTitle("");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="quick-add">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Agregar tarea para ${label}…`} maxLength={200} aria-label={`Nueva tarea para ${label}`} />
        <button className="btn small" disabled={busy || !title.trim()} aria-label="Agregar" style={{ minHeight: 48 }}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
