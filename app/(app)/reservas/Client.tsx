"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export function ReservationActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const set = async (s: string) => {
    setBusy(true);
    await api(`/api/reservations/${id}`, { status: s }, "PATCH").catch((e) => alert(e.message));
    setBusy(false);
    router.refresh();
  };
  if (status === "CANCELADA" || status === "NO_SHOW")
    return (
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn small ghost" disabled={busy} onClick={() => set("CONFIRMADA")}>
          Reactivar
        </button>
      </div>
    );
  return (
    <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
      {status === "CONFIRMADA" && (
        <button className="btn small" disabled={busy} onClick={() => set("SENTADA")}>
          Llegaron
        </button>
      )}
      {status === "CONFIRMADA" && (
        <button className="btn small secondary" disabled={busy} onClick={() => set("NO_SHOW")}>
          No vinieron
        </button>
      )}
      <button className="btn small ghost" disabled={busy} onClick={() => window.confirm("¿Cancelar la reserva?") && set("CANCELADA")}>
        Cancelar
      </button>
    </div>
  );
}

export function NewReservation({ date }: { date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", people: "2", time: "21:00", notes: "", date });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Reserva por teléfono
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(undefined);
        try {
          const r = await api<{ overCapacity: boolean }>("/api/reservations", { ...f, people: Number(f.people) });
          if (r.overCapacity) alert("Reserva cargada. Ojo: esa franja supera el cupo habitual.");
          setOpen(false);
          setF({ ...f, name: "", phone: "", notes: "" });
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid-2">
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={f.name} onChange={set("name")} required autoFocus />
        </div>
        <div className="field">
          <label>Teléfono</label>
          <input className="input" type="tel" value={f.phone} onChange={set("phone")} required />
        </div>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="field">
          <label>Día</label>
          <input className="input" type="date" value={f.date} onChange={set("date")} required />
        </div>
        <div className="field">
          <label>Hora</label>
          <input className="input" type="time" step={1800} value={f.time} onChange={set("time")} required />
        </div>
        <div className="field">
          <label>Personas</label>
          <input className="input" type="number" min={1} max={40} value={f.people} onChange={set("people")} required />
        </div>
      </div>
      <div className="field">
        <label>Comentarios</label>
        <input className="input" value={f.notes} onChange={set("notes")} maxLength={500} />
      </div>
      {msg && <p className="error">{msg}</p>}
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
