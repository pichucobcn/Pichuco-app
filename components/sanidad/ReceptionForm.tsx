"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

export function ReceptionForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const { save, busy, error } = useSave();
  const empty = { supplierId: suppliers[0]?.id ?? "", supplierName: "", product: "", temperature: "", lot: "", expiryDate: "", packagingOk: true, labelOk: true, accepted: true, notes: "" };
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState<string>();
  const supplierName = f.supplierId ? suppliers.find((s) => s.id === f.supplierId)?.name ?? "" : f.supplierName;

  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save<{ problems: string[] }>("recepcion", {
          supplierId: f.supplierId || null,
          supplierName,
          product: f.product,
          temperature: f.temperature ? Number(f.temperature.replace(",", ".")) : null,
          lot: f.lot || null,
          expiryDate: f.expiryDate || null,
          packagingOk: f.packagingOk,
          labelOk: f.labelOk,
          accepted: f.accepted,
          notes: f.notes || null,
        });
        if (r) {
          setMsg(r.problems.length ? `Registrada con incidencia: ${r.problems.join(", ")}. Se avisó a los responsables.` : "Recepción registrada.");
          setF({ ...empty, supplierId: f.supplierId });
        }
      }}
    >
      <div className="eyebrow">Nueva recepción</div>
      <div className="grid-2">
        <div className="field">
          <label>Proveedor</label>
          <select className="input" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">Otro…</option>
          </select>
        </div>
        {!f.supplierId && (
          <div className="field">
            <label>Nombre del proveedor</label>
            <input className="input" value={f.supplierName} onChange={(e) => setF({ ...f, supplierName: e.target.value })} required />
          </div>
        )}
      </div>
      <div className="field">
        <label>Producto</label>
        <input className="input" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} required placeholder="Mozzarella 10 kg" />
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="field">
          <label>Temp. (°C)</label>
          <input className="input" inputMode="decimal" value={f.temperature} onChange={(e) => setF({ ...f, temperature: e.target.value })} placeholder="Si aplica" />
        </div>
        <div className="field">
          <label>Lote</label>
          <input className="input" value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} />
        </div>
        <div className="field">
          <label>Caducidad</label>
          <input className="input" type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} />
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={f.packagingOk} onChange={(e) => setF({ ...f, packagingOk: e.target.checked })} />
        <span>Envases en buen estado</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={f.labelOk} onChange={(e) => setF({ ...f, labelOk: e.target.checked })} />
        <span>Etiquetado correcto (lote, caducidad, registro sanitario)</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={!f.accepted} onChange={(e) => setF({ ...f, accepted: !e.target.checked })} />
        <span>
          <b>Rechazar</b> la mercancía
        </span>
      </label>
      <div className="field">
        <label>Observaciones</label>
        <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={f.accepted ? "Opcional" : "Motivo del rechazo"} />
      </div>
      {msg && <span className="small muted">{msg}</span>}
      {error && <p className="error">{error}</p>}
      <button className="btn block" disabled={busy}>
        <Icon name="check" size={18} /> Registrar recepción
      </button>
    </form>
  );
}
