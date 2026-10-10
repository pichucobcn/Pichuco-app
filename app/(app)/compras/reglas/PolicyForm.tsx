"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export function PolicyForm({
  policy,
  users,
}: {
  policy: { autoLimit: number; managerLimit: number; alwaysApprove: string[] };
  users: { id: string; name: string; role: string; limit: number | null }[];
}) {
  const router = useRouter();
  const [auto, setAuto] = useState(String(policy.autoLimit));
  const [manager, setManager] = useState(String(policy.managerLimit));
  const [cats, setCats] = useState(policy.alwaysApprove.join(", "));
  const [limits, setLimits] = useState<Record<string, string>>(Object.fromEntries(users.map((u) => [u.id, u.limit == null ? "" : String(u.limit)])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const n = (s: string) => Number(s.replace(",", "."));

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(undefined);
        try {
          await api(
            "/api/purchases/policy",
            {
              autoLimit: n(auto),
              managerLimit: n(manager),
              alwaysApprove: cats.split(",").map((c) => c.trim()).filter(Boolean),
              userLimits: Object.fromEntries(Object.entries(limits).map(([id, v]) => [id, v.trim() ? n(v) : null])),
            },
            "PUT",
          );
          setMsg("Guardado.");
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card stack">
        <div className="eyebrow">Límites</div>
        <div className="grid-2">
          <div className="field">
            <label>Automático hasta (€)</label>
            <input className="input" inputMode="decimal" value={auto} onChange={(e) => setAuto(e.target.value)} required />
          </div>
          <div className="field">
            <label>Aprobación del jefe hasta (€)</label>
            <input className="input" inputMode="decimal" value={manager} onChange={(e) => setManager(e.target.value)} required />
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Por encima del segundo límite la aprobación es obligatoria y sólo se puede dar desde la pantalla del pedido (Pichuco AI no puede aprobarla).
        </p>
        <div className="field">
          <label>Categorías que siempre requieren aprobación</label>
          <input className="input" value={cats} onChange={(e) => setCats(e.target.value)} placeholder="Equipamiento, Bebidas…" />
        </div>
      </div>
      <div className="card stack">
        <div className="eyebrow">Límite automático por persona</div>
        <p className="small muted" style={{ margin: 0 }}>
          Vacío = usa el general.
        </p>
        {users.map((u) => (
          <div key={u.id} className="row">
            <div style={{ flex: 1 }}>
              <b>{u.name}</b>
              <div className="small muted">{u.role}</div>
            </div>
            <input
              className="input"
              inputMode="decimal"
              value={limits[u.id]}
              onChange={(e) => setLimits({ ...limits, [u.id]: e.target.value })}
              placeholder={auto}
              aria-label={`Límite de ${u.name}`}
              style={{ maxWidth: 110, textAlign: "right" }}
            />
            <span className="small muted">€</span>
          </div>
        ))}
      </div>
      {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
      <button className="btn block" disabled={busy}>
        Guardar reglas
      </button>
    </form>
  );
}
