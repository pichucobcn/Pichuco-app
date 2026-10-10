"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export function NewProductForm({ suppliers, categories }: { suppliers: { id: string; name: string }[]; categories: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [f, setF] = useState({ name: "", category: categories[0] ?? "", unit: "kg", stock: "", minStock: "", supplierId: "", usualPrice: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const n = (s: string) => (s ? Number(s.replace(",", ".")) : undefined);

  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Nuevo producto
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          await api("/api/stock", {
            name: f.name,
            category: f.category,
            unit: f.unit,
            stock: n(f.stock) ?? 0,
            minStock: n(f.minStock) ?? 0,
            supplierId: f.supplierId || null,
            usualPrice: n(f.usualPrice) ?? null,
          });
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
        <label>Producto</label>
        <input className="input" value={f.name} onChange={set("name")} required maxLength={100} placeholder="Mozzarella" autoFocus />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Categoría</label>
          <input className="input" list="cats" value={f.category} onChange={set("category")} required maxLength={50} />
          <datalist id="cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Unidad</label>
          <input className="input" value={f.unit} onChange={set("unit")} required maxLength={20} placeholder="kg, l, cajas…" />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Stock actual</label>
          <input className="input" inputMode="decimal" value={f.stock} onChange={set("stock")} />
        </div>
        <div className="field">
          <label>Stock mínimo</label>
          <input className="input" inputMode="decimal" value={f.minStock} onChange={set("minStock")} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Proveedor habitual</label>
          <select className="input" value={f.supplierId} onChange={set("supplierId")}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Precio habitual (€)</label>
          <input className="input" inputMode="decimal" value={f.usualPrice} onChange={set("usualPrice")} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button className="btn" disabled={busy}>
          Crear
        </button>
      </div>
    </form>
  );
}
