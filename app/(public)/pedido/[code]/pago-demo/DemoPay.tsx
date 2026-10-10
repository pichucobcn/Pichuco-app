"use client";
import { useState } from "react";
import { api } from "@/components/api";

export function DemoPay({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid-2">
      <a className="btn secondary" href={`/pedido/${code}?pago=cancelado`}>
        Cancelar
      </a>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await api(`/api/public/takeaway/${code}/demo-pay`).catch(() => null);
          window.location.href = `/pedido/${code}?pago=ok`;
        }}
      >
        Pagar (simulado)
      </button>
    </div>
  );
}
