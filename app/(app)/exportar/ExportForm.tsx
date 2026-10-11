"use client";
import { useState } from "react";

type Set = { key: string; label: string; description: string };

export function ExportForm({ sets }: { sets: Set[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return (
    <div className="stack">
      <div className="card grid-2">
        <div className="field">
          <label htmlFor="ex-from">Desde</label>
          <input id="ex-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ex-to">Hasta</label>
          <input id="ex-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="small muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
          {from || to ? `Período: ${from || "el principio"} → ${to || "hoy"}` : "Sin fechas: todo lo registrado hasta hoy."}
        </p>
      </div>
      <div className="card stack" style={{ gap: 0, padding: "4px 16px" }}>
        {sets.map((s) => (
          <div key={s.key} className="export-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{s.label}</b>
              <div className="small muted">{s.description}</div>
            </div>
            <a className="btn small" href={`/api/export/${s.key}${qs ? `?${qs}` : ""}`} download>
              Descargar
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
