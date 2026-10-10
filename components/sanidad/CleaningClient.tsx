"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

export function CleaningDone({ id, done, name }: { id: string; done: boolean; name: string }) {
  const { save, busy } = useSave();
  return (
    <button className="check" disabled={busy} onClick={() => save("limpieza", { itemId: id })} aria-label={done ? `${name}: registrar otra limpieza` : `Marcar ${name} como hecho`} title="Registrar limpieza">
      {done && <Icon name="check" size={20} stroke={3} />}
    </button>
  );
}

export function CleaningItemForm() {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", area: "Cocina", frequency: "DIARIA", method: "" });
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Añadir al plan de limpieza
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save("limpieza-item", { ...f, method: f.method || null })) {
          setOpen(false);
          setF({ ...f, name: "", method: "" });
        }
      }}
    >
      <div className="field">
        <label>Qué se limpia</label>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Horno de pizza" />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Zona</label>
          <input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} required list="zonas" />
          <datalist id="zonas">
            <option value="Cocina" />
            <option value="Sala" />
            <option value="Baños" />
            <option value="Almacén" />
          </datalist>
        </div>
        <div className="field">
          <label>Frecuencia</label>
          <select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
            <option value="DIARIA">Diaria</option>
            <option value="SEMANAL">Semanal</option>
            <option value="MENSUAL">Mensual</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Producto y método</label>
        <input className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} placeholder="Desengrasante, aclarar y secar" />
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
