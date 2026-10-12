/**
 * Exportación de registros a CSV (Excel en español: separado por ";", con BOM).
 * Cada conjunto tiene su permiso: fichajes y personal para el jefe, sanidad
 * para quien gestiona sanidad, compras y tareas para quien las lleva.
 * Sin fechas, se exporta todo el histórico.
 */
import { db } from "../db";
import { addDays, dateOf, isISODate, serviceDayOf, timeOf, toDbDate, todayISO } from "../dates";
import { assertCan, can, ValidationError, type Permission } from "../permissions";
import { clockRecords } from "./clock";
import { allergenLabel } from "./sanidad";
import type { Actor } from "./context";

type Row = (string | number | null | undefined)[];
type Range = { from: string; to: string };

export type ExportDataset = {
  key: string;
  label: string;
  description: string;
  permission: Permission;
  build: (r: Range) => Promise<Row[]>;
};

const EPOCH = "2020-01-01";
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
/** Consulta amplia por fecha/hora; luego se filtra por día de servicio. */
const atRange = ({ from, to }: Range) => ({ gte: new Date(toDbDate(from).getTime() - 2 * 3_600_000), lt: new Date(toDbDate(addDays(to, 1)).getTime() + 6 * 3_600_000) });
const inDays = ({ from, to }: Range) => (d: Date) => {
  const s = serviceDayOf(d);
  return s >= from && s <= to;
};
const dateRange = ({ from, to }: Range) => ({ gte: toDbDate(from), lte: toDbDate(to) });

/** La exportación ya comprobó el permiso del conjunto; para leer los fichajes de todos actúa como jefe. */
const SYSTEM_MANAGER = { id: "", role: "JEFE" } as unknown as Actor;

export const DATASETS: ExportDataset[] = [
  {
    key: "fichajes",
    label: "Fichajes (registro de jornada)",
    description: "Una fila por persona y día: entrada, salida, pausas y horas trabajadas.",
    permission: "fichajes_equipo",
    async build(r) {
      const days = await clockRecords(SYSTEM_MANAGER, { from: r.from, to: r.to });
      return [
        ["Fecha", "Persona", "Entrada", "Salida", "Pausas", "Horas trabajadas", "Detalle", "Notas"],
        ...days.map((d) => [d.date, d.name, d.entrada, d.salida ?? (d.sinSalida ? "sin salida" : ""), d.pausas.join(", "), d.sinSalida ? "" : hm(d.minutos), d.detalle, d.notas]),
      ];
    },
  },
  {
    key: "retrasos",
    label: "Retrasos y ausencias",
    description: "Avisos de retraso y ausencia del equipo, con el motivo.",
    permission: "personal",
    async build(r) {
      const list = await db.incident.findMany({ where: { date: dateRange(r) }, include: { user: { select: { name: true } }, reportedBy: { select: { shortName: true } } }, orderBy: { date: "asc" } });
      return [
        ["Fecha", "Persona", "Tipo", "Minutos", "Motivo", "Avisó", "Registrado"],
        ...list.map((i) => [dateOf(i.date), i.user.name, i.type === "RETRASO" ? "Retraso" : "Ausencia", i.minutes, i.reason, i.reportedBy.shortName, `${dateOf(i.createdAt)} ${timeOf(i.createdAt)}`]),
      ];
    },
  },
  {
    key: "temperaturas",
    label: "Temperaturas",
    description: "Lecturas de neveras y congeladores, con el rango y la acción correctora.",
    permission: "sanidad_gestion",
    async build(r) {
      const list = (await db.temperatureLog.findMany({ where: { at: atRange(r) }, include: { equipment: true, user: { select: { shortName: true } } }, orderBy: { at: "asc" } })).filter((t) => inDays(r)(t.at));
      return [
        ["Día", "Fecha", "Hora", "Equipo", "Temperatura (°C)", "Rango", "Resultado", "Acción correctora", "Persona"],
        ...list.map((t) => [serviceDayOf(t.at), dateOf(t.at), timeOf(t.at), t.equipment.name, String(t.value).replace(".", ","), `${t.equipment.minTemp} a ${t.equipment.maxTemp}`, t.outOfRange ? "Fuera de rango" : "Correcto", t.correctiveAction, t.user.shortName]),
      ];
    },
  },
  {
    key: "limpieza",
    label: "Limpieza y desinfección",
    description: "Cada limpieza registrada del plan.",
    permission: "sanidad_gestion",
    async build(r) {
      const list = (await db.cleaningLog.findMany({ where: { at: atRange(r) }, include: { item: true, user: { select: { shortName: true } } }, orderBy: { at: "asc" } })).filter((c) => inDays(r)(c.at));
      return [
        ["Día", "Fecha", "Hora", "Elemento", "Zona", "Frecuencia", "Método", "Persona", "Notas"],
        ...list.map((c) => [serviceDayOf(c.at), dateOf(c.at), timeOf(c.at), c.item.name, c.item.area, c.item.frequency.toLowerCase(), c.item.method, c.user.shortName, c.notes]),
      ];
    },
  },
  {
    key: "elaboraciones",
    label: "Elaboraciones y lotes",
    description: "Trazabilidad: lote, cantidad, caducidad y alérgenos.",
    permission: "sanidad_gestion",
    async build(r) {
      const list = (await db.elaboration.findMany({ where: { madeAt: atRange(r) }, include: { user: { select: { shortName: true } } }, orderBy: { madeAt: "asc" } })).filter((e) => inDays(r)(e.madeAt));
      return [
        ["Fecha", "Hora", "Producto", "Lote", "Cantidad", "Conservación", "Caduca", "Estado", "Alérgenos", "Persona", "Motivo de descarte"],
        ...list.map((e) => [dateOf(e.madeAt), timeOf(e.madeAt), e.name, e.lot, e.quantity != null ? `${e.quantity} ${e.unit ?? ""}`.trim() : "", e.storage.toLowerCase(), dateOf(e.expiresAt), e.status.replace("_", " ").toLowerCase(), e.allergens.map(allergenLabel).join(", "), e.user.shortName, e.discardReason]),
      ];
    },
  },
  {
    key: "recepciones",
    label: "Recepción de mercancías",
    description: "Controles al recibir: temperatura, envase, etiquetado, lote y caducidad.",
    permission: "sanidad_gestion",
    async build(r) {
      const list = (await db.receptionCheck.findMany({ where: { at: atRange(r) }, include: { user: { select: { shortName: true } } }, orderBy: { at: "asc" } })).filter((x) => inDays(r)(x.at));
      return [
        ["Fecha", "Hora", "Proveedor", "Producto", "Lote", "Caducidad", "Temperatura (°C)", "Envase", "Etiquetado", "Resultado", "Notas", "Persona"],
        ...list.map((x) => [dateOf(x.at), timeOf(x.at), x.supplierName, x.product, x.lot, x.expiryDate ? dateOf(x.expiryDate) : "", x.temperature != null ? String(x.temperature).replace(".", ",") : "", x.packagingOk ? "Correcto" : "Defectuoso", x.labelOk ? "Correcto" : "Defectuoso", x.accepted ? "Aceptada" : "Rechazada", x.notes, x.user.shortName]),
      ];
    },
  },
  {
    key: "incidencias",
    label: "Incidencias sanitarias",
    description: "No conformidades con su acción correctora.",
    permission: "sanidad_gestion",
    async build(r) {
      const list = (await db.nonConformity.findMany({ where: { createdAt: atRange(r) }, include: { createdBy: { select: { shortName: true } }, closedBy: { select: { shortName: true } } }, orderBy: { createdAt: "asc" } })).filter((n) => inDays(r)(n.createdAt));
      return [
        ["Fecha", "Hora", "Origen", "Descripción", "Estado", "Acción correctora", "Abrió", "Cerró", "Fecha de cierre"],
        ...list.map((n) => [dateOf(n.createdAt), timeOf(n.createdAt), n.source.toLowerCase(), n.description, n.status.toLowerCase(), n.correctiveAction, n.createdBy.shortName, n.closedBy?.shortName, n.closedAt ? `${dateOf(n.closedAt)} ${timeOf(n.closedAt)}` : ""]),
      ];
    },
  },
  {
    key: "plagas",
    label: "Control de plagas",
    description: "Visitas de la empresa de control de plagas.",
    permission: "sanidad_gestion",
    async build(r) {
      const list = await db.pestControlVisit.findMany({ where: { date: dateRange(r) }, orderBy: { date: "asc" } });
      return [["Fecha", "Empresa", "Tipo", "Notas", "Próxima visita"], ...list.map((p) => [dateOf(p.date), p.company, p.kind.toLowerCase(), p.notes, p.nextVisit ? dateOf(p.nextVisit) : ""])];
    },
  },
  {
    key: "formacion",
    label: "Formación de manipuladores",
    description: "Certificados del equipo (todos, sin filtrar por fecha).",
    permission: "sanidad_gestion",
    async build() {
      const list = await db.trainingCert.findMany({ include: { user: { select: { name: true } } }, orderBy: { issuedAt: "asc" } });
      return [["Persona", "Curso", "Entidad", "Fecha", "Vence"], ...list.map((t) => [t.user.name, t.title, t.provider, dateOf(t.issuedAt), t.expiresAt ? dateOf(t.expiresAt) : ""])];
    },
  },
  {
    key: "compras",
    label: "Pedidos de compra",
    description: "Pedidos a proveedores con productos, total, estado y quién aprobó.",
    permission: "compras",
    async build(r) {
      const list = (
        await db.purchaseOrder.findMany({
          where: { createdAt: atRange(r) },
          include: { supplier: true, createdBy: { select: { shortName: true } }, approvedBy: { select: { shortName: true } }, lines: { include: { product: true } } },
          orderBy: { number: "asc" },
        })
      ).filter((o) => inDays(r)(o.createdAt));
      return [
        ["Nº", "Fecha", "Proveedor", "Productos", "Total (€)", "Estado", "Entrega", "Pedido por", "Aprobado por", "Entregado"],
        ...list.map((o) => [
          o.number,
          dateOf(o.createdAt),
          o.supplier.name,
          o.lines.map((l) => `${l.quantity} ${l.product.unit} ${l.product.name}`).join(", "),
          o.total ? o.total.toFixed(2).replace(".", ",") : "",
          o.status.replace("_", " ").toLowerCase(),
          o.deliveryDate ? `${dateOf(o.deliveryDate)}${o.deliveryTime ? ` ${o.deliveryTime}${o.deliveryTimeTo ? `–${o.deliveryTimeTo}` : ""}` : ""}` : "",
          o.createdBy.shortName,
          o.approvedBy?.shortName,
          o.deliveredAt ? dateOf(o.deliveredAt) : "",
        ]),
      ];
    },
  },
  {
    key: "tareas",
    label: "Tareas y producción",
    description: "Tareas del equipo con su estado y responsable.",
    permission: "tareas_todas",
    async build(r) {
      const list = await db.task.findMany({
        where: { OR: [{ date: dateRange(r) }, { date: null, createdAt: atRange(r) }] },
        include: { assignee: { select: { shortName: true } }, createdBy: { select: { shortName: true } } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });
      return [
        ["Fecha", "Hora límite", "Tarea", "Tipo", "Cantidad", "Asignada a", "Prioridad", "Estado", "Creada por"],
        ...list.map((t) => [t.date ? dateOf(t.date) : dateOf(t.createdAt), t.dueTime, t.title, t.kind.toLowerCase(), t.quantity != null ? `${t.quantity} ${t.unit ?? ""}`.trim() : "", t.assignee?.shortName, t.priority.toLowerCase(), t.status.replace("_", " ").toLowerCase(), t.createdBy.shortName]),
      ];
    },
  },
];

export function availableDatasets(actor: Actor) {
  return DATASETS.filter((d) => can(actor, d.permission));
}

const cell = (v: Row[number]) => {
  const s = v == null ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(actor: Actor, key: string, from?: string | null, to?: string | null) {
  const ds = DATASETS.find((d) => d.key === key);
  if (!ds) throw new ValidationError("No existe ese tipo de exportación.");
  assertCan(actor, ds.permission);
  const range = { from: from || EPOCH, to: to || todayISO() };
  if (!isISODate(range.from) || !isISODate(range.to) || range.from > range.to) throw new ValidationError("Rango de fechas no válido.");
  const rows = await ds.build(range);
  const body = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const name = `pichuco-${ds.key}-${from ? range.from : "inicio"}_${range.to}.csv`;
  return { body, name, count: rows.length - 1 };
}
