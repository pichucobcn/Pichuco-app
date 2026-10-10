"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

type P = { id: string; name: string; category: string; unit: string; minStock: number; usualPrice: number | null; supplierId: string | null };

export function ProductEditForm({ product, suppliers, categories }: { product: P; suppliers: { id: string; name: string }[]; categories: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: product.name,
    category: product.category,
    unit: product.unit,
    minStock: product.minStock ? String(product.minStock) : "",
    usualPrice: product.usualPrice != null ? String(product.usualPrice) : "",
    supplierId: product.supplierId ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const n = (s: string) => Number(s.replace(",", "."));

  if (!open)
    return (
      <button className="btn secondary block" onClick={() => setOpen(true)}>
        Editar ficha
      </button>
    );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          await api(
            `/api/stock/${product.id}`,
            {
              name: f.name,
              category: f.category,
              unit: f.unit,
              minStock: f.minStock ? n(f.minStock) : 0,
              usualPrice: f.usualPrice ? n(f.usualPrice) : null,
              supplierId: f.supplierId || null,
            },
            "PATCH",
          );
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
        <input className="input" value={f.name} onChange={set("name")} required maxLength={100} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Categoría</label>
          <input className="input" list="cats-edit" value={f.category} onChange={set("category")} required />
          <datalist id="cats-edit">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Unidad</label>
          <input className="input" value={f.unit} onChange={set("unit")} required placeholder="kg, l, cajas…" />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Stock mínimo ({f.unit})</label>
          <input className="input" inputMode="decimal" value={f.minStock} onChange={set("minStock")} placeholder="Sin mínimo" />
        </div>
        <div className="field">
          <label>Precio habitual (€/{f.unit})</label>
          <input className="input" inputMode="decimal" value={f.usualPrice} onChange={set("usualPrice")} placeholder="Sin precio" />
        </div>
      </div>
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
