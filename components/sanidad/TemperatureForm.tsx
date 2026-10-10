"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

export function TemperatureForm({ equipmentId, min, max, label }: { equipmentId: string; min: number; max: number; label: string | null }) {
  const { save, busy, error } = useSave();
  const [value, setValue] = useState("");
  const [action, setAction] = useState("");
  const [saved, setSaved] = useState<string>();
  const n = Number(value.replace(",", "."));
  const out = value !== "" && Number.isFinite(n) && (n < min || n > max);

  return (
    <form
      className="stack"
      style={{ marginTop: 10, gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!Number.isFinite(n) || value === "") return;
        const r = await save<{ outOfRange: boolean }>("temperatura", { equipmentId, value: n, correctiveAction: out ? action : null });
        if (r) {
          setSaved(r.outOfRange ? "Guardado. Se avisó a los responsables." : "Guardado.");
          setValue("");
          setAction("");
        }
      }}
    >
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input temp-input"
          inputMode="decimal"
          placeholder="°C"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/[^\d,.\-]/g, ""));
            setSaved(undefined);
          }}
          aria-label="Temperatura en grados"
        />
        <button className="btn" disabled={busy || value === ""} style={{ flex: "none" }}>
          <Icon name="check" size={18} /> {label ? `Registrar ${label.toLowerCase()}` : "Registrar"}
        </button>
      </div>
      {out && (
        <div className="field">
          <label style={{ color: "var(--burgundy)" }}>Fuera de rango: ¿qué hiciste?</label>
          <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ej.: cerré bien la puerta y vuelvo a medir en 30 min" maxLength={500} />
        </div>
      )}
      {saved && <span className="small muted">{saved}</span>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function EquipmentForm() {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", kind: "REFRIGERACION", minTemp: "0", maxTemp: "4", checksPerDay: "2" });
  const presets: Record<string, [string, string]> = { REFRIGERACION: ["0", "4"], CONGELACION: ["-25", "-18"], CALIENTE: ["65", "90"] };
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Nuevo equipo
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save("equipo", { name: f.name, kind: f.kind, minTemp: Number(f.minTemp), maxTemp: Number(f.maxTemp), checksPerDay: Number(f.checksPerDay) });
        if (r) setOpen(false);
      }}
    >
      <div className="field">
        <label>Nombre</label>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Cámara 2" />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Tipo</label>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, minTemp: presets[e.target.value][0], maxTemp: presets[e.target.value][1] })}>
            <option value="REFRIGERACION">Refrigeración</option>
            <option value="CONGELACION">Congelación</option>
            <option value="CALIENTE">Mantenimiento en caliente</option>
          </select>
        </div>
        <div className="field">
          <label>Lecturas al día</label>
          <input className="input" type="number" min={1} max={6} value={f.checksPerDay} onChange={(e) => setF({ ...f, checksPerDay: e.target.value })} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Mínima (°C)</label>
          <input className="input" inputMode="decimal" value={f.minTemp} onChange={(e) => setF({ ...f, minTemp: e.target.value })} />
        </div>
        <div className="field">
          <label>Máxima (°C)</label>
          <input className="input" inputMode="decimal" value={f.maxTemp} onChange={(e) => setF({ ...f, maxTemp: e.target.value })} />
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
