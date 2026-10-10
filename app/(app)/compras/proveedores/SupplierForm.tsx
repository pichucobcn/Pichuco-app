"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export type SupplierData = {
  id?: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hours: string | null;
  deliveryDays: number[];
  deliveryTime: string | null;
  deliveryTimeTo: string | null;
  minOrder: number | null;
  conditions: string | null;
  channel: string;
  notes: string | null;
};

const EMPTY: SupplierData = {
  name: "", contactName: "", phone: "", whatsapp: "", email: "", hours: "", deliveryDays: [], deliveryTime: "", deliveryTimeTo: "",
  minOrder: null, conditions: "", channel: "WHATSAPP", notes: "",
};

/** Alta o edición de proveedor. Sin `initial` es el botón "Nuevo proveedor". */
export function SupplierForm({ initial }: { initial?: SupplierData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<SupplierData>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const text = (k: keyof SupplierData) => ({
    value: (f[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }),
  });

  if (!open)
    return initial ? (
      <button className="btn secondary block" onClick={() => setOpen(true)}>
        Editar datos
      </button>
    ) : (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Nuevo proveedor
      </button>
    );

  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
        try {
          await api(initial?.id ? `/api/suppliers/${initial.id}` : "/api/suppliers", {
            name: f.name,
            contactName: clean(f.contactName),
            phone: clean(f.phone),
            whatsapp: clean(f.whatsapp),
            email: clean(f.email),
            hours: clean(f.hours),
            deliveryDays: f.deliveryDays,
            deliveryTime: clean(f.deliveryTime),
            deliveryTimeTo: clean(f.deliveryTime) ? clean(f.deliveryTimeTo) : null,
            minOrder: f.minOrder,
            conditions: clean(f.conditions),
            channel: f.channel,
            notes: clean(f.notes),
          }, initial?.id ? "PATCH" : "POST");
          setOpen(false);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label>Nombre</label>
        <input className="input" required maxLength={100} {...text("name")} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Contacto</label>
          <input className="input" {...text("contactName")} />
        </div>
        <div className="field">
          <label>Enviar pedidos por</label>
          <select className="input" {...text("channel")}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
            <option value="TELEFONO">Teléfono</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Teléfono</label>
          <input className="input" type="tel" {...text("phone")} />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input className="input" type="tel" {...text("whatsapp")} />
        </div>
      </div>
      <div className="field">
        <label>Email</label>
        <input className="input" type="email" {...text("email")} />
      </div>
      <div className="field">
        <label>Días de reparto</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {DAYS.map((d, i) => {
            const on = f.deliveryDays.includes(i);
            return (
              <button
                key={d}
                type="button"
                className={`day-chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => setF({ ...f, deliveryDays: on ? f.deliveryDays.filter((x) => x !== i) : [...f.deliveryDays, i].sort() })}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Reparte entre las</label>
          <input className="input" type="time" {...text("deliveryTime")} />
        </div>
        <div className="field">
          <label>y las</label>
          <input className="input" type="time" {...text("deliveryTimeTo")} />
        </div>
      </div>
      <div className="field">
        <label>Pedido mínimo (€)</label>
        <input
          className="input"
          inputMode="decimal"
          value={f.minOrder ?? ""}
          onChange={(e) => setF({ ...f, minOrder: e.target.value ? Number(e.target.value.replace(",", ".")) : null })}
        />
      </div>
      <div className="field">
        <label>Horario de atención</label>
        <input className="input" placeholder="L–V 8:00–15:00" {...text("hours")} />
      </div>
      <div className="field">
        <label>Condiciones</label>
        <textarea className="input" rows={2} {...text("conditions")} />
      </div>
      {error && <p className="error">{error}</p>}
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
