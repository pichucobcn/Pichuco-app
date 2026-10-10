"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { ContactFields, DayPicker, EMPTY_CONTACT, SlotPicker } from "@/components/public/DayPicker";

export function ReservationForm({ days, maxParty, phone, today }: { days: string[]; maxParty: number; phone: string; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(days[0] ?? "");
  const [people, setPeople] = useState(2);
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [c, setC] = useState(EMPTY_CONTACT);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    fetch(`/api/public/availability?type=reserva&date=${date}&n=${people}`)
      .then((r) => r.json())
      .then((r) => {
        setSlots(r.slots ?? []);
        setTime((t) => ((r.slots ?? []).includes(t) ? t : ""));
      })
      .finally(() => setLoading(false));
  }, [date, people]);

  return (
    <form
      className="stack"
      style={{ marginTop: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!time) return setError("Elegí un horario.");
        setBusy(true);
        setError(undefined);
        try {
          const r = await api<{ code: string }>("/api/public/reservations", { date, time, people, notes, ...c });
          router.push(`/reserva/${r.code}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="card stack">
        <div className="eyebrow">¿Cuántos son?</div>
        <div className="qty-stepper">
          <button type="button" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="Menos personas">
            −
          </button>
          <b>
            {people} {people === 1 ? "persona" : "personas"}
          </b>
          <button type="button" onClick={() => setPeople(Math.min(maxParty, people + 1))} aria-label="Más personas" disabled={people >= maxParty}>
            +
          </button>
        </div>
        {people >= maxParty && (
          <p className="small muted" style={{ margin: 0 }}>
            ¿Son más? Llamanos al <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>.
          </p>
        )}
        <div className="eyebrow">Día</div>
        <DayPicker days={days} value={date} onChange={setDate} today={today} />
        <div className="eyebrow">Hora</div>
        <SlotPicker slots={slots} value={time} onChange={setTime} loading={loading} empty="No quedan mesas ese día. Probá otro día." />
      </div>
      <div className="card stack">
        <div className="eyebrow">Tus datos</div>
        <ContactFields f={c} set={(p) => setC({ ...c, ...p })} />
        <div className="field">
          <label htmlFor="r-notes">Comentarios (opcional)</label>
          <input id="r-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Cumpleaños, trona, alergias…" />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy || !time || !c.privacy}>
          Confirmar reserva
        </button>
      </div>
    </form>
  );
}
