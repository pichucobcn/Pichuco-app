"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

/** Teléfono de contacto: lo usan los pedidos ("Llamar antes a…"). */
export function PhoneEditor({ userId, phone, compact = false }: { userId: string; phone: string | null; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact && !phone);
  const [value, setValue] = useState(phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!open)
    return (
      <button className={compact ? "link-btn" : "btn small secondary"} onClick={() => setOpen(true)} style={compact ? { marginTop: 4 } : undefined}>
        {phone ? "Cambiar teléfono" : "Añadir teléfono"}
      </button>
    );
  return (
    <form
      className="stack"
      style={{ gap: 6, marginTop: compact ? 6 : 0 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          await api(`/api/team/${userId}/phone`, { phone: value || null }, "PUT");
          setOpen(false);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!compact && (
        <label className="small muted" htmlFor={`ph-${userId}`}>
          Tu teléfono: los proveedores te llaman antes de entregar si figurás como contacto.
        </label>
      )}
      <div className="row" style={{ gap: 6 }}>
        <input id={`ph-${userId}`} className="input" type="tel" inputMode="tel" value={value} onChange={(e) => setValue(e.target.value)} placeholder="600 00 00 00" />
        <button className="btn small" disabled={busy}>
          Guardar
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
