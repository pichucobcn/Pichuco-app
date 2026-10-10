"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export function NewTaskForm({
  canProduce,
  canAssign,
  team,
  defaultKind,
  today,
}: {
  canProduce: boolean;
  canAssign: boolean;
  team: { id: string; name: string }[];
  defaultKind: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [f, setF] = useState({ title: "", kind: defaultKind, assigneeId: "", date: today, dueTime: "", priority: "MEDIA", quantity: "", unit: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const isProd = f.kind === "PRODUCCION";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/tasks", {
        title: f.title,
        kind: f.kind,
        assigneeId: f.assigneeId || undefined,
        date: f.date || undefined,
        dueTime: f.dueTime || undefined,
        priority: f.priority,
        quantity: isProd && f.quantity ? Number(f.quantity) : undefined,
        unit: isProd && f.unit ? f.unit : undefined,
        area: isProd ? "COCINA" : undefined,
      });
      setF({ ...f, title: "", quantity: "", unit: "", dueTime: "" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button className="btn add block" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Nueva {defaultKind === "PRODUCCION" ? "producción" : "tarea"}
      </button>
    );

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="field">
        <label>¿Qué hay que hacer?</label>
        <input className="input" value={f.title} onChange={set("title")} placeholder={isProd ? "Milanesas" : "Limpiar la campana"} required maxLength={200} autoFocus />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Tipo</label>
          <select className="input" value={f.kind} onChange={set("kind")}>
            <option value="GENERAL">General</option>
            {canProduce && <option value="PRODUCCION">Producción</option>}
            <option value="LIMPIEZA">Limpieza</option>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="ADMINISTRATIVA">Administrativa</option>
          </select>
        </div>
        <div className="field">
          <label>Prioridad</label>
          <select className="input" value={f.priority} onChange={set("priority")}>
            <option value="BAJA">Baja</option>
            <option value="MEDIA">Media</option>
            <option value="ALTA">Alta</option>
          </select>
        </div>
      </div>
      {isProd && (
        <div className="grid-2">
          <div className="field">
            <label>Cantidad</label>
            <input className="input" type="number" min="0" step="any" inputMode="decimal" value={f.quantity} onChange={set("quantity")} />
          </div>
          <div className="field">
            <label>Unidad</label>
            <input className="input" value={f.unit} onChange={set("unit")} placeholder="kg, l, unidades…" maxLength={30} />
          </div>
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label>Fecha</label>
          <input className="input" type="date" value={f.date} onChange={set("date")} />
        </div>
        <div className="field">
          <label>Hora límite</label>
          <input className="input" type="time" value={f.dueTime} onChange={set("dueTime")} />
        </div>
      </div>
      {(canAssign || isProd) && (
        <div className="field">
          <label>Responsable</label>
          <select className="input" value={f.assigneeId} onChange={set("assigneeId")}>
            <option value="">{isProd ? "Cocina" : "Sin asignar (mi área)"}</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}
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
