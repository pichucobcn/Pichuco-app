"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

/** Ajuste rápido: restar/sumar o registrar un recuento. */
export function StockAdjust({ id, unit, stock }: { id: string; unit: string; stock: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const step = unit === "kg" || unit === "l" ? 1 : 1;

  async function send(body: object) {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/stock/${id}`, body);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        <button className="btn small secondary" disabled={busy} onClick={() => send({ delta: -step, reason: "CONSUMO" })} aria-label={`Restar 1 ${unit}`}>
          −1
        </button>
        <button className="btn small secondary" disabled={busy} onClick={() => send({ delta: step, reason: "AJUSTE" })} aria-label={`Sumar 1 ${unit}`}>
          +1
        </button>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => setOpen(true)}>
          Recuento
        </button>
      </div>
    );
  return (
    <form
      className="row"
      style={{ marginTop: 10, gap: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        send({ stock: Number(count.replace(",", ".")), reason: "AJUSTE", note: "Recuento" });
      }}
    >
      <input className="input" inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} aria-label={`Stock contado en ${unit}`} style={{ maxWidth: 110 }} autoFocus />
      <span className="small muted">{unit}</span>
      <span className="spacer" />
      <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      <button className="btn small" disabled={busy}>
        Guardar
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
