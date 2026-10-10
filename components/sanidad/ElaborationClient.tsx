"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

type Type = { id: string; name: string; shelfLifeDays: number; storage: string; unit: string; allergens: string[] };

export function ElaborationForm({ types, allergens }: { types: Type[]; allergens: { key: string; label: string }[] }) {
  const router = useRouter();
  const { save, busy, error } = useSave();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((t) => t.id === typeId);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [days, setDays] = useState(String(type?.shelfLifeDays ?? 2));
  const [storage, setStorage] = useState(type?.storage ?? "REFRIGERADO");
  const [alg, setAlg] = useState<string[]>(type?.allergens ?? []);

  function pick(id: string) {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t) {
      setDays(String(t.shelfLifeDays));
      setStorage(t.storage);
      setAlg(t.allergens);
    } else {
      setAlg([]);
    }
  }

  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save<{ id: string }>("elaboracion", {
          typeId: type ? type.id : null,
          name: type ? null : name,
          quantity: qty ? Number(qty.replace(",", ".")) : null,
          unit: type?.unit ?? "kg",
          shelfLifeDays: Number(days),
          storage,
          allergens: alg,
        });
        if (r) router.push(`/sanidad/etiquetas/${r.id}`);
      }}
    >
      <div className="eyebrow">Nueva elaboración</div>
      <div className="grid-2">
        <div className="field">
          <label>Qué</label>
          <select className="input" value={typeId} onChange={(e) => pick(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="">Otra…</option>
          </select>
        </div>
        <div className="field">
          <label>Cantidad ({type?.unit ?? "kg"})</label>
          <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {!type && (
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Chimichurri" />
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label>Vida útil (días)</label>
          <input className="input" type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div className="field">
          <label>Conservación</label>
          <select className="input" value={storage} onChange={(e) => setStorage(e.target.value)}>
            <option value="REFRIGERADO">Refrigerado</option>
            <option value="CONGELADO">Congelado</option>
            <option value="AMBIENTE">Ambiente</option>
          </select>
        </div>
      </div>
      <details>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
          Alérgenos ({alg.length})
        </summary>
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {allergens.map((a) => {
            const on = alg.includes(a.key);
            return (
              <button key={a.key} type="button" className={`day-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setAlg(on ? alg.filter((x) => x !== a.key) : [...alg, a.key])}>
                {a.label}
              </button>
            );
          })}
        </div>
      </details>
      {error && <p className="error">{error}</p>}
      <button className="btn block" disabled={busy}>
        <Icon name="plus" size={18} /> Registrar y ver etiqueta
      </button>
    </form>
  );
}

export function ElaborationActions({ id, expired }: { id: string; expired: boolean }) {
  const { save, busy } = useSave();
  return (
    <>
      {!expired && (
        <button className="btn small" disabled={busy} onClick={() => save("elaboracion-estado", { id, status: "CONSUMIDO" })}>
          Consumido
        </button>
      )}
      <button
        className={`btn small ${expired ? "" : "ghost"}`}
        disabled={busy}
        onClick={() => {
          const reason = expired ? "Caducado" : window.prompt("¿Por qué se desecha?", "Caducado");
          if (reason !== null) save("elaboracion-estado", { id, status: "DESECHADO", reason });
        }}
      >
        Desechar
      </button>
    </>
  );
}
