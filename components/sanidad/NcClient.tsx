"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

export function CloseNc({ id }: { id: string }) {
  const { save, busy, error } = useSave();
  const [text, setText] = useState("");
  return (
    <form
      className="row"
      style={{ marginTop: 10, gap: 6 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save("incidencia-cerrar", { id, correctiveAction: text })) setText("");
      }}
    >
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Acción correctora tomada" required minLength={3} />
      <button className="btn small" disabled={busy}>
        Cerrar
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function NewNc() {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ description: "", source: "OTRO", correctiveAction: "" });
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Registrar incidencia
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save("incidencia", { ...f, correctiveAction: f.correctiveAction || undefined })) {
          setOpen(false);
          setF({ description: "", source: "OTRO", correctiveAction: "" });
        }
      }}
    >
      <div className="field">
        <label>Qué pasó</label>
        <input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required minLength={3} placeholder="La cámara 1 no enfría bien" />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Tipo</label>
          <select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="TEMPERATURA">Temperatura</option>
            <option value="RECEPCION">Recepción</option>
            <option value="LIMPIEZA">Limpieza</option>
            <option value="ELABORACION">Elaboración</option>
            <option value="PLAGAS">Plagas</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>
        <div className="field">
          <label>Acción tomada (si ya la hay)</label>
          <input className="input" value={f.correctiveAction} onChange={(e) => setF({ ...f, correctiveAction: e.target.value })} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button className="btn" disabled={busy}>
          Guardar
        </button>
      </div>
    </form>
  );
}
