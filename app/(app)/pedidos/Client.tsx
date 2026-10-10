"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

/** Refresca el tablero solo, para que cocina vea los pedidos nuevos. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => !document.hidden && router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

const NEXT: Record<string, { to: string; label: string }> = {
  NUEVO: { to: "EN_PREPARACION", label: "Empezar" },
  CONFIRMADO: { to: "EN_PREPARACION", label: "Empezar" },
  EN_PREPARACION: { to: "LISTO", label: "Listo" },
  LISTO: { to: "RETIRADO", label: "Entregado" },
};

export function TakeawayActions({ id, status, canDeliver }: { id: string; status: string; canDeliver: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = NEXT[status];
  if (!next) return null;
  const set = async (s: string) => {
    setBusy(true);
    await api(`/api/takeaway/${id}`, { status: s }, "PATCH").catch((e) => alert(e.message));
    setBusy(false);
    router.refresh();
  };
  return (
    <div className="row" style={{ marginTop: 10, gap: 6 }}>
      {(next.to !== "RETIRADO" || canDeliver) && (
        <button className="btn small" disabled={busy} onClick={() => set(next.to)}>
          {next.label}
        </button>
      )}
      {status === "NUEVO" && (
        <button className="btn small secondary" disabled={busy} onClick={() => set("CONFIRMADO")}>
          Confirmar
        </button>
      )}
      {canDeliver && (
        <button className="btn small ghost" disabled={busy} onClick={() => window.confirm("¿Cancelar este pedido?") && set("CANCELADO")}>
          Cancelar
        </button>
      )}
    </div>
  );
}
