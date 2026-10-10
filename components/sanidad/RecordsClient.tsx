"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

const today = () => new Date().toISOString().slice(0, 10);

export function TrainingForm({ team }: { team: { id: string; name: string }[] }) {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ userId: team[0]?.id ?? "", title: "Manipulador de alimentos", provider: "", issuedAt: today(), expiresAt: "" });
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Cargar certificado
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save("formacion", { ...f, provider: f.provider || null, expiresAt: f.expiresAt || null })) setOpen(false);
      }}
    >
      <div className="grid-2">
        <div className="field">
          <label>Persona</label>
          <select className="input" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Curso</label>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </div>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="field">
          <label>Entidad</label>
          <input className="input" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
        </div>
        <div className="field">
          <label>Fecha</label>
          <input className="input" type="date" value={f.issuedAt} onChange={(e) => setF({ ...f, issuedAt: e.target.value })} required />
        </div>
        <div className="field">
          <label>Vence</label>
          <input className="input" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
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

export function PestForm() {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: today(), company: "", kind: "REVISION", notes: "", nextVisit: "" });
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Registrar visita
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save("plagas", { ...f, notes: f.notes || null, nextVisit: f.nextVisit || null })) setOpen(false);
      }}
    >
      <div className="grid-2">
        <div className="field">
          <label>Empresa</label>
          <input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} required />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="REVISION">Revisión</option>
            <option value="TRATAMIENTO">Tratamiento</option>
            <option value="INCIDENCIA">Incidencia</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Fecha</label>
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>Próxima visita</label>
          <input className="input" type="date" value={f.nextVisit} onChange={(e) => setF({ ...f, nextVisit: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Observaciones</label>
        <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
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
