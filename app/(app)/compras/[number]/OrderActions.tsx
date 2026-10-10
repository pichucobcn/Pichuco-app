"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

type Line = { id: string; name: string; unit: string; quantity: number };

export function OrderActions({
  order,
  links,
  canApprove,
  mandatory,
  team,
  contacts,
}: {
  order: { id: string; number: number; status: string; total: number; deliveryDate: string; deliveryTime: string; deliveryTimeTo: string; callBeforeId: string; lines: Line[] };
  links: { text: string; whatsapp: string | null; email: string | null; phone: string | null };
  canApprove: boolean;
  mandatory: boolean;
  team: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [date, setDate] = useState(order.deliveryDate);
  const [time, setTime] = useState(order.deliveryTime || "10:00");
  const [timeTo, setTimeTo] = useState(order.deliveryTimeTo || "");
  // Por defecto lo recibe quien figura como "llamar antes a".
  const [responsibleId, setResponsibleId] = useState(order.callBeforeId);
  const [received, setReceived] = useState<Record<string, string>>(() => Object.fromEntries(order.lines.map((l) => [l.id, String(l.quantity)])));
  const [copied, setCopied] = useState(false);

  async function act(action: string, body: object = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/purchases/${order.id}/${action}`, body);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = order.status;
  return (
    <section className="stack" style={{ marginTop: 12 }}>
      {s === "PENDIENTE_APROBACION" &&
        (canApprove ? (
          <div className="card stack">
            <div className="eyebrow">{mandatory ? "Aprobación obligatoria" : "Necesita tu aprobación"}</div>
            <div className="grid-2">
              <button className="btn secondary" disabled={busy} onClick={() => {
                  const reason = window.prompt("¿Por qué lo rechazás? (opcional)");
                  if (reason !== null) act("reject", { reason: reason || undefined });
                }}>
                Rechazar
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => act("approve", {}, mandatory ? `Vas a aprobar un gasto de €${order.total.toFixed(2)}. ¿Confirmás?` : undefined)}
              >
                <Icon name="check" size={18} /> Aprobar
              </button>
            </div>
          </div>
        ) : (
          <div className="card small">Esperando la aprobación de Martín. Ya le avisamos.</div>
        ))}

      {s === "APROBADO" && (
        <div className="card stack">
          <div className="eyebrow">Enviar al proveedor</div>
          <div className="field">
            <label htmlFor="cb-contact">Llamar antes a</label>
            <select id="cb-contact" className="input" value={order.callBeforeId} disabled={busy} onChange={(e) => act("contact", { userId: e.target.value || null })}>
              <option value="">Nadie</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <pre className="supplier-msg">{links.text}</pre>
          <div className="grid-2">
            {links.whatsapp && (
              <a className="btn" href={links.whatsapp} target="_blank" rel="noreferrer" onClick={() => setTimeout(() => act("send", { via: "WHATSAPP" }), 400)}>
                WhatsApp
              </a>
            )}
            {links.email && (
              <a className="btn" href={links.email} onClick={() => setTimeout(() => act("send", { via: "EMAIL" }), 400)}>
                Email
              </a>
            )}
            <button
              type="button"
              className="btn secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(links.text).catch(() => null);
                setCopied(true);
              }}
            >
              {copied ? "Copiado" : "Copiar texto"}
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => act("send", { via: links.phone ? "TELEFONO" : "OTRO" })}>
              Ya lo pedí
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Se abre WhatsApp o el correo con el pedido escrito: sólo tenés que enviarlo. Más adelante se podrá enviar automáticamente.
          </p>
        </div>
      )}

      {(s === "ENVIADO" || s === "CONFIRMADO") && (
        <div className="card stack">
          <div className="eyebrow">{s === "ENVIADO" ? "¿Confirmó el proveedor?" : "Cambiar la entrega"}</div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="c-date">Entregar el día</label>
              <input id="c-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="c-from">Entre las</label>
              <input id="c-from" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-to">y las</label>
              <input id="c-to" className="input" type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Quién lo recibe</label>
            <select className="input" value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">Sin asignar</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" disabled={busy || !date || !time} onClick={() => act("confirm", { deliveryDate: date, deliveryTime: time, deliveryTimeTo: timeTo || null, responsibleId: responsibleId || null })}>
            {s === "ENVIADO" ? "Confirmado: guardar en la Agenda" : "Actualizar entrega"}
          </button>
        </div>
      )}

      {(s === "ENVIADO" || s === "CONFIRMADO") && (
        <div className="card stack">
          <div className="eyebrow">Recepción</div>
          <table className="simple">
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td style={{ width: 120 }}>
                    <div className="row" style={{ gap: 4 }}>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={received[l.id]}
                        onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                        aria-label={`Recibido de ${l.name}`}
                        style={{ padding: "9px 8px", textAlign: "right" }}
                      />
                      <span className="small muted">{l.unit}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              act("receive", {
                received: Object.fromEntries(Object.entries(received).map(([k, v]) => [k, Number(v.replace(",", ".")) || 0])),
              })
            }
          >
            Llegó: sumar al stock
          </button>
        </div>
      )}

      {!["ENTREGADO", "CANCELADO"].includes(s) && (
        <button className="btn ghost" style={{ color: "var(--cream)" }} disabled={busy} onClick={() => {
            const reason = window.prompt("¿Cancelar este pedido? Motivo (opcional)");
            if (reason !== null) act("cancel", { reason: reason || undefined });
          }}>
          Cancelar pedido
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
