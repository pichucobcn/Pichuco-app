"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useSave } from "./useSave";

type Dish = { id?: string; name: string; category: string; allergens: string[]; traces: string[] };

function DishForm({ dish, allergens, categories, onDone }: { dish: Dish; allergens: { key: string; label: string }[]; categories: string[]; onDone: () => void }) {
  const { save, busy, error } = useSave();
  const [d, setD] = useState(dish);
  const cycle = (k: string) => {
    // contiene → trazas → nada
    if (d.allergens.includes(k)) setD({ ...d, allergens: d.allergens.filter((x) => x !== k), traces: [...d.traces, k] });
    else if (d.traces.includes(k)) setD({ ...d, traces: d.traces.filter((x) => x !== k) });
    else setD({ ...d, allergens: [...d.allergens, k] });
  };
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save("plato", { id: d.id, name: d.name, category: d.category, allergens: d.allergens, traces: d.traces })) onDone();
      }}
    >
      <div className="grid-2">
        <div className="field">
          <label>Plato</label>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>Categoría</label>
          <input className="input" list="dish-cats" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} required />
          <datalist id="dish-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="field">
        <label>Alérgenos (tocá: contiene → trazas → no)</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {allergens.map((a) => {
            const state = d.allergens.includes(a.key) ? "on" : d.traces.includes(a.key) ? "trace" : "";
            return (
              <button key={a.key} type="button" className={`day-chip ${state}`} onClick={() => cycle(a.key)}>
                {a.label}
                {state === "trace" ? " (trazas)" : ""}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        {d.id && (
          <button
            type="button"
            className="btn small ghost"
            onClick={async () => {
              if (window.confirm(`¿Quitar "${d.name}" de la tabla?`) && (await save("plato-baja", { id: d.id }))) onDone();
            }}
          >
            Quitar plato
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn small secondary" onClick={onDone}>
          Cancelar
        </button>
        <button className="btn small" disabled={busy}>
          Guardar
        </button>
      </div>
    </form>
  );
}

export function DishEditor({ dishes, allergens, categories }: { dishes: Dish[]; allergens: { key: string; label: string }[]; categories: string[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="stack">
      {editing === "new" ? (
        <DishForm dish={{ name: "", category: categories[0] ?? "Pizzas", allergens: [], traces: [] }} allergens={allergens} categories={categories} onDone={() => setEditing(null)} />
      ) : (
        <button className="btn add block" onClick={() => setEditing("new")}>
          <Icon name="plus" size={18} /> Nuevo plato
        </button>
      )}
      <div className="card chat-list">
        {dishes.map((d) =>
          editing === d.id ? (
            <div key={d.id} style={{ padding: "10px 0" }}>
              <DishForm dish={d} allergens={allergens} categories={categories} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <button key={d.id} className="chat-row" style={{ background: "none", border: 0, width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => setEditing(d.id!)}>
              <div style={{ flex: 1 }}>
                <b>{d.name}</b>
                <div className="small muted">
                  {d.category} · {d.allergens.length ? d.allergens.map((k) => allergens.find((a) => a.key === k)?.label).join(", ") : "Sin alérgenos"}
                </div>
              </div>
              <span className="small muted">Editar</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
