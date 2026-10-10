"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

const LABELS: Record<string, { text: string; cls: string }> = {
  ENTRADA: { text: "Fichar entrada", cls: "btn huge block" },
  SALIDA: { text: "Fichar salida", cls: "btn huge block dark" },
  PAUSA_INICIO: { text: "Empezar pausa", cls: "btn huge block secondary" },
  PAUSA_FIN: { text: "Terminar pausa", cls: "btn huge block" },
};

export function ClockButtons({ allowed }: { allowed: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [incident, setIncident] = useState("");

  async function doClock(type: string) {
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/clock", { type, note: incident || undefined });
      setIncident("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <div className={allowed.length > 1 ? "grid-2" : "stack"}>
        {allowed.map((t) => (
          <button key={t} className={LABELS[t].cls} disabled={busy} onClick={() => doClock(t)}>
            {LABELS[t].text}
          </button>
        ))}
      </div>
      <details className="card">
        <summary>+ Añadir una nota o incidencia</summary>
        <div className="field" style={{ marginTop: 10 }}>
          <input className="input" value={incident} onChange={(e) => setIncident(e.target.value)} placeholder="Ej.: me olvidé de fichar a las 18:00" maxLength={300} />
          <span className="small muted">Se guarda con tu próximo fichaje. Para retrasos o ausencias, contáselo a Pichuco AI.</span>
        </div>
      </details>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
