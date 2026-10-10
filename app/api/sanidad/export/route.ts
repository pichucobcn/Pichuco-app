import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { dateOf, timeOf } from "@/lib/dates";
import { allergenLabel, foodSafetyReport } from "@/lib/services/sanidad";

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exporta los registros del período en CSV (separado por ";" para Excel en español). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const r = await foodSafetyReport(user, u.searchParams.get("from") ?? "", u.searchParams.get("to") ?? "");
  const rows: unknown[][] = [["Tipo", "Fecha", "Hora", "Detalle", "Valor", "Resultado", "Acción / notas", "Responsable"]];
  for (const t of r.temps)
    rows.push(["Temperatura", dateOf(t.at), timeOf(t.at), t.equipment.name, `${t.value} °C`, t.outOfRange ? `Fuera de rango (${t.equipment.minTemp} a ${t.equipment.maxTemp})` : "Correcto", t.correctiveAction, t.user.shortName]);
  for (const x of r.receptions)
    rows.push(["Recepción", dateOf(x.at), timeOf(x.at), `${x.product} · ${x.supplierName}${x.lot ? ` · lote ${x.lot}` : ""}`, x.temperature != null ? `${x.temperature} °C` : "", x.accepted ? "Aceptada" : "Rechazada", x.notes, x.user.shortName]);
  for (const c of r.cleaning) rows.push(["Limpieza", dateOf(c.at), timeOf(c.at), `${c.item.name} (${c.item.area})`, "", "Hecho", c.notes, c.user.shortName]);
  for (const e of r.elaborations)
    rows.push(["Elaboración", dateOf(e.madeAt), timeOf(e.madeAt), `${e.name} · lote ${e.lot}`, e.quantity ? `${e.quantity} ${e.unit ?? ""}` : "", `Caduca ${dateOf(e.expiresAt)} · ${e.status}`, e.allergens.map(allergenLabel).join(", "), e.user.shortName]);
  for (const n of r.ncs)
    rows.push(["Incidencia", dateOf(n.createdAt), timeOf(n.createdAt), n.description, n.source, n.status, n.correctiveAction, n.createdBy.shortName]);
  for (const p of r.pest) rows.push(["Plagas", dateOf(p.date), "", p.company, p.kind, "", p.notes, ""]);
  const body = "﻿" + rows.map((row) => row.map(csv).join(";")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pichuco-appcc-${r.from}_${r.to}.csv"`,
    },
  });
});
