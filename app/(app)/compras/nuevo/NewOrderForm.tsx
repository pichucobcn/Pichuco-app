"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

type Product = { id: string; name: string; unit: string; category: string; price: number; stock: number; minStock: number; suggested: number };
type Supplier = { id: string; name: string; minOrder: number | null; nextDelivery: string; deliveryTime: string | null; deliveryTimeTo: string | null; products: Product[] };

const eur = (n: number) => `€${n.toFixed(2).replace(".", ",")}`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

export function NewOrderForm({
  suppliers,
  initial,
  policy,
  contacts,
  defaultContactId,
}: {
  suppliers: Supplier[];
  contacts: { id: string; name: string; hasPhone: boolean }[];
  defaultContactId: string;
  initial: { supplierId?: string; productId?: string; quantity?: number };
  policy: { autoLimit: number; managerLimit: number; alwaysApprove: string[]; isApprover: boolean };
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers.some((s) => s.id === initial.supplierId) ? initial.supplierId! : (suppliers[0]?.id ?? ""));
  const supplier = suppliers.find((s) => s.id === supplierId);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    initial.productId && initial.quantity ? { [initial.productId]: String(initial.quantity) } : {},
  );
  const [date, setDate] = useState(supplier?.nextDelivery ?? "");
  const [time, setTime] = useState(supplier?.deliveryTime ?? "");
  const [timeTo, setTimeTo] = useState(supplier?.deliveryTimeTo ?? "");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState(defaultContactId);
  const contact = contacts.find((c) => c.id === contactId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function pickSupplier(id: string) {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    setQty({});
    setDate(s?.nextDelivery ?? "");
    setTime(s?.deliveryTime ?? "");
    setTimeTo(s?.deliveryTimeTo ?? "");
  }

  const lines = useMemo(
    () =>
      (supplier?.products ?? [])
        .map((p) => ({ p, q: Number((qty[p.id] ?? "").replace(",", ".")) }))
        .filter((l) => l.q > 0),
    [supplier, qty],
  );
  const total = lines.reduce((s, l) => s + l.q * l.p.price, 0);
  const unpriced = lines.some((l) => !l.p.price);
  const sensitive = lines.some((l) => policy.alwaysApprove.map((c) => c.toLowerCase()).includes(l.p.category.toLowerCase()));
  const approval =
    total > policy.managerLimit
      ? { tone: "red", text: `Supera ${eur(policy.managerLimit)}: aprobación obligatoria de Martín desde la app.` }
      : unpriced || sensitive || total > policy.autoLimit
        ? policy.isApprover
          ? { tone: "green", text: "Lo aprobás vos al crearlo." }
          : {
              tone: "amber",
              text: unpriced
                ? "Hay productos sin precio cargado: lo tiene que aprobar Martín."
                : `Necesita aprobación de Martín (supera ${eur(policy.autoLimit)}${sensitive ? " o es una categoría sensible" : ""}).`,
            }
        : { tone: "green", text: `Se aprueba solo (no supera ${eur(policy.autoLimit)}).` };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines.length) return setError("Poné al menos una cantidad.");
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ number: number }>("/api/purchases", {
        supplierId,
        lines: lines.map((l) => ({ productId: l.p.id, quantity: l.q })),
        deliveryDate: date || undefined,
        deliveryTime: time || undefined,
        deliveryTimeTo: time && timeTo ? timeTo : undefined,
        notes: notes || undefined,
        callBeforeId: contactId || null,
      });
      router.push(`/compras/${r.number}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <div className="field">
          <label htmlFor="o-supplier">Proveedor</label>
          <select id="o-supplier" className="input" value={supplierId} onChange={(e) => pickSupplier(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="o-date">Entregar el día</label>
          <input id="o-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="o-from">Entre las</label>
            <input id="o-from" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="o-to">y las</label>
            <input id="o-to" className="input" type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="o-contact">Llamar antes a</label>
          <select id="o-contact" className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Nadie</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {contact && !contact.hasPhone && (
            <span className="small muted">{contact.name} no tiene teléfono cargado: se puede añadir en Equipo.</span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Productos
        </div>
        <table className="simple">
          <tbody>
            {supplier?.products.map((p) => {
              const low = p.minStock > 0 && p.stock < p.minStock;
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <div className="small muted">
                      Stock {fmt(p.stock)} {p.unit}
                      {low && <span style={{ color: "var(--burgundy)", fontWeight: 600 }}> · bajo mínimo</span>} · {p.price ? `${eur(p.price)}/${p.unit}` : "sin precio"}
                    </div>
                    {low && !qty[p.id] && (
                      <button type="button" className="link-btn" onClick={() => setQty({ ...qty, [p.id]: String(p.suggested) })}>
                        Sugerido: {fmt(p.suggested)} {p.unit}
                      </button>
                    )}
                  </td>
                  <td style={{ width: 110 }}>
                    <div className="row" style={{ gap: 4 }}>
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="0"
                        value={qty[p.id] ?? ""}
                        onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })}
                        aria-label={`Cantidad de ${p.name} en ${p.unit}`}
                        style={{ padding: "9px 8px", textAlign: "right" }}
                      />
                      <span className="small muted">{p.unit}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <div className="row">
          <span className="eyebrow">Total estimado</span>
          <span className="spacer" />
          <b className="order-total" style={{ fontSize: 26 }}>
            {lines.length && lines.every((l) => !l.p.price) ? "Sin precio" : unpriced ? `${eur(total)} + sin precio` : eur(total)}
          </b>
        </div>
        {lines.length > 0 && <span className={`tag ${approval.tone}`} style={{ whiteSpace: "normal" }}>{approval.text}</span>}
        {supplier?.minOrder && total > 0 && total < supplier.minOrder && (
          <span className="tag amber" style={{ whiteSpace: "normal" }}>
            El pedido mínimo de {supplier.name} es {eur(supplier.minOrder)}.
          </span>
        )}
        <div className="field">
          <label>Nota para el proveedor</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Opcional" />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy || !lines.length}>
          Preparar pedido
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          Nada se envía al proveedor hasta que lo confirmes en el siguiente paso.
        </p>
      </div>
    </form>
  );
}
