"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export function MarkRead({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn small"
      style={{ marginTop: 10 }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api(`/api/announcements/${id}/read`).catch(() => null);
        router.refresh();
      }}
    >
      <Icon name="check" size={18} stroke={2.5} /> Marcar como leído
    </button>
  );
}

export function NewAnnouncement() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", level: "GENERAL" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Nuevo comunicado
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          await api("/api/announcements", { ...f, body: f.body || f.title });
          setOpen(false);
          setF({ title: "", body: "", level: "GENERAL" });
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label>Título</label>
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={140} placeholder="Mañana llegan las bebidas a las 18:15" />
      </div>
      <div className="field">
        <label>Mensaje</label>
        <textarea className="input" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={4000} placeholder="Eva queda responsable de recibirlo." />
      </div>
      <div className="field">
        <label>Tipo</label>
        <select className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
          <option value="URGENTE">Urgente</option>
          <option value="IMPORTANTE">Importante</option>
          <option value="GENERAL">General</option>
          <option value="INFORMATIVO">Informativo</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button className="btn" disabled={busy}>
          Publicar
        </button>
      </div>
    </form>
  );
}
