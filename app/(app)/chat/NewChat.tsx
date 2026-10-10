"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export function NewChat({ team }: { team: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Nueva conversación
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
          const r = await api<{ id: string }>("/api/chat", { memberIds: sel, name: sel.length > 1 ? name || null : null });
          router.push(`/chat/${r.id}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label>¿Con quién?</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {team.map((u) => {
            const on = sel.includes(u.id);
            return (
              <button key={u.id} type="button" className={`day-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x !== u.id) : [...sel, u.id])}>
                {u.name}
              </button>
            );
          })}
        </div>
      </div>
      {sel.length > 1 && (
        <div className="field">
          <label>Nombre del grupo</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Sala, Cocina…" />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button className="btn" disabled={busy || !sel.length}>
          Empezar
        </button>
      </div>
    </form>
  );
}
