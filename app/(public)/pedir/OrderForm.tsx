"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { ContactFields, DayPicker, EMPTY_CONTACT, SlotPicker } from "@/components/public/DayPicker";

type Item = { id: string; category: string; name: string; description: string | null; price: number; isPizza: boolean };
type Extra = { id: string; name: string; price: number };
type Line = { key: string; itemId: string; quantity: number; extraIds: string[] };

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const CATEGORY: Record<string, string> = { PIZZA: "Pizzas", FAINA: "Fainá", EMPANADA: "Empanadas", POSTRE: "Postres", BEBIDA: "Bebidas" };

export function OrderForm({
  days,
  today,
  items,
  extras,
  onlinePayments,
}: {
  days: string[];
  today: string;
  items: Item[];
  extras: Extra[];
  onlinePayments: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [date, setDate] = useState(days[0] ?? "");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pay, setPay] = useState<"ONLINE" | "AL_RECOGER">(onlinePayments ? "ONLINE" : "AL_RECOGER");
  const [c, setC] = useState(EMPTY_CONTACT);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const exById = useMemo(() => Object.fromEntries(extras.map((e) => [e.id, e])), [extras]);
  const unit = (l: Line) => byId[l.itemId].price + l.extraIds.reduce((s, id) => s + (exById[id]?.price ?? 0), 0);
  const total = lines.reduce((s, l) => s + unit(l) * l.quantity, 0);
  const pizzas = lines.filter((l) => byId[l.itemId].isPizza).reduce((s, l) => s + l.quantity, 0);
  const categories = [...new Set(items.map((i) => i.category))];

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    fetch(`/api/public/availability?type=takeaway&date=${date}&n=${Math.max(1, pizzas)}`)
      .then((r) => r.json())
      .then((r) => {
        setSlots(r.slots ?? []);
        setTime((t) => ((r.slots ?? []).includes(t) ? t : ""));
      })
      .finally(() => setLoading(false));
  }, [date, pizzas]);

  function add(item: Item, extraIds: string[] = []) {
    const key = item.id + "|" + [...extraIds].sort().join(",");
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      return found ? prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)) : [...prev, { key, itemId: item.id, quantity: 1, extraIds }];
    });
    setOpen(null);
    setChosen([]);
  }
  const change = (key: string, d: number) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));
  const countOf = (id: string) => lines.filter((l) => l.itemId === id).reduce((s, l) => s + l.quantity, 0);

  return (
    <form
      className="stack"
      style={{ marginTop: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!lines.length) return setError("Elegí al menos un producto.");
        if (!time) return setError("Elegí a qué hora pasás a buscarlo.");
        setBusy(true);
        setError(undefined);
        try {
          const r = await api<{ code: string; payUrl: string | null }>("/api/public/takeaway", {
            date,
            time,
            items: lines.map((l) => ({ menuItemId: l.itemId, quantity: l.quantity, extraIds: l.extraIds })),
            paymentMethod: pay,
            notes,
            ...c,
          });
          if (r.payUrl) window.location.href = r.payUrl;
          else router.push(`/pedido/${r.code}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {categories.map((cat) => (
        <section key={cat} className="card">
          <h2 className="menu-cat">{CATEGORY[cat] ?? cat}</h2>
          <div className="menu-list">
            {items
              .filter((i) => i.category === cat)
              .map((i) => (
                <div key={i.id} className="menu-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{i.name}</b>
                    {i.description && <div className="small muted">{i.description}</div>}
                    <div className="menu-price">{eur(i.price)}</div>
                    {open === i.id && (
                      <div className="extras">
                        {extras.map((e) => (
                          <label key={e.id} className="check-row">
                            <input
                              type="checkbox"
                              checked={chosen.includes(e.id)}
                              onChange={(ev) => setChosen(ev.target.checked ? [...chosen, e.id] : chosen.filter((x) => x !== e.id))}
                            />
                            <span>
                              {e.name} <span className="muted">+{eur(e.price)}</span>
                            </span>
                          </label>
                        ))}
                        <div className="row" style={{ gap: 6 }}>
                          <button type="button" className="btn small" onClick={() => add(i, chosen)}>
                            Agregar
                          </button>
                          <button type="button" className="btn small ghost" onClick={() => setOpen(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {open !== i.id && (
                    <div className="row" style={{ gap: 6, flex: "none" }}>
                      {countOf(i.id) > 0 && <span className="pill">{countOf(i.id)}</span>}
                      {i.isPizza && extras.length > 0 && (
                        <button type="button" className="btn small ghost" onClick={() => { setOpen(i.id); setChosen([]); }}>
                          Extras
                        </button>
                      )}
                      <button type="button" className="add-btn" onClick={() => add(i)} aria-label={`Agregar ${i.name}`}>
                        +
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}

      <section className="card stack" id="tu-pedido">
        <div className="eyebrow">Tu pedido</div>
        {lines.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Todavía no elegiste nada.
          </p>
        ) : (
          <table className="simple">
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    <b>{byId[l.itemId].name}</b>
                    {l.extraIds.length > 0 && <div className="small muted">+ {l.extraIds.map((id) => exById[id]?.name).join(", ")}</div>}
                  </td>
                  <td style={{ width: 110 }}>
                    <div className="qty-stepper small-stepper">
                      <button type="button" onClick={() => change(l.key, -1)} aria-label="Quitar uno">
                        −
                      </button>
                      <b>{l.quantity}</b>
                      <button type="button" onClick={() => change(l.key, 1)} aria-label="Agregar uno">
                        +
                      </button>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(unit(l) * l.quantity)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <span className="eyebrow">Total</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <b className="order-total">{eur(total)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <div className="eyebrow">¿Cuándo pasás a buscarlo?</div>
        <DayPicker days={days} value={date} onChange={setDate} today={today} />
        <SlotPicker slots={slots} value={time} onChange={setTime} loading={loading} empty="No quedan horarios ese día. Probá otro." />
      </section>

      <section className="card stack">
        <div className="eyebrow">Tus datos</div>
        <ContactFields f={c} set={(p) => setC({ ...c, ...p })} />
        <div className="field">
          <label htmlFor="o-notes">Comentarios (opcional)</label>
          <input id="o-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Sin cebolla, cortada en 8…" />
        </div>
        <div className="eyebrow">Pago</div>
        <div className="pay-options">
          {onlinePayments && (
            <label className={`pay-option ${pay === "ONLINE" ? "on" : ""}`}>
              <input type="radio" name="pay" checked={pay === "ONLINE"} onChange={() => setPay("ONLINE")} />
              <b>Pagar ahora</b>
              <span className="small muted">Con tarjeta, online</span>
            </label>
          )}
          <label className={`pay-option ${pay === "AL_RECOGER" ? "on" : ""}`}>
            <input type="radio" name="pay" checked={pay === "AL_RECOGER"} onChange={() => setPay("AL_RECOGER")} />
            <b>Pagar al retirar</b>
            <span className="small muted">Efectivo o tarjeta en el local</span>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy || !lines.length || !time || !c.privacy}>
          {pay === "ONLINE" ? `Pagar ${eur(total)}` : `Confirmar pedido · ${eur(total)}`}
        </button>
      </section>

      {lines.length > 0 && (
        <a href="#tu-pedido" className="cart-bar">
          <span>
            {lines.reduce((s, l) => s + l.quantity, 0)} productos · {eur(total)}
          </span>
          <b>Ver pedido</b>
        </a>
      )}
    </form>
  );
}
