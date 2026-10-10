"use client";

const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Selector de día en chips. El primer día abierto puede ser hoy. */
export function DayPicker({ days, value, onChange, today }: { days: string[]; value: string; onChange: (d: string) => void; today?: string }) {
  return (
    <div className="days days-light" role="radiogroup" aria-label="Día">
      {days.map((d) => (
        <button key={d} type="button" role="radio" aria-checked={value === d} className={value === d ? "active" : ""} onClick={() => onChange(d)}>
          <span>{d === today ? "hoy" : WD[new Date(d + "T00:00:00Z").getUTCDay()]}</span>
          <b>{d.slice(8)}</b>
        </button>
      ))}
    </div>
  );
}

export function SlotPicker({
  slots,
  value,
  onChange,
  loading,
  empty,
}: {
  slots: string[];
  value: string;
  onChange: (t: string) => void;
  loading: boolean;
  empty: string;
}) {
  if (loading) return <p className="small muted">Buscando horarios…</p>;
  if (!slots.length) return <p className="small muted">{empty}</p>;
  return (
    <div className="slots" role="radiogroup" aria-label="Hora">
      {slots.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} className={`day-chip ${value === t ? "on" : ""}`} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export type Contact = { name: string; phone: string; email: string; privacy: boolean; marketing: boolean; website: string };

export const EMPTY_CONTACT: Contact = { name: "", phone: "", email: "", privacy: false, marketing: false, website: "" };

export function ContactFields({ f, set }: { f: Contact; set: (patch: Partial<Contact>) => void }) {
  return (
    <>
      <div className="field">
        <label htmlFor="c-name">Nombre</label>
        <input id="c-name" className="input" autoComplete="name" value={f.name} onChange={(e) => set({ name: e.target.value })} required maxLength={80} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="c-phone">Teléfono</label>
          <input id="c-phone" className="input" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="c-email">Email (opcional)</label>
          <input id="c-email" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
      </div>
      {/* Campo trampa para bots: oculto a las personas */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={f.website}
        onChange={(e) => set({ website: e.target.value })}
        className="hp"
        aria-hidden="true"
      />
      <label className="check-row">
        <input type="checkbox" checked={f.privacy} onChange={(e) => set({ privacy: e.target.checked })} required />
        <span>
          Acepto la{" "}
          <a href="/privacidad" target="_blank">
            política de privacidad
          </a>
          . Usamos tus datos sólo para gestionar tu reserva o pedido.
        </span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={f.marketing} onChange={(e) => set({ marketing: e.target.checked })} />
        <span>Quiero recibir novedades de Pichuco (opcional).</span>
      </label>
    </>
  );
}
