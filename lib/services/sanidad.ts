import { z } from "zod";
import { db } from "../db";
import { addDays, dateOf, isISODate, timeOf, toDbDate, todayISO } from "../dates";
import { assertCan, can, NotFoundError, ValidationError } from "../permissions";
import { audit } from "./audit";
import type { Actor, ActionContext } from "./context";
import { notify } from "./notifications";

/**
 * Controles sanitarios (APPCC): temperaturas, recepción, limpieza,
 * trazabilidad de elaboraciones, alérgenos, plagas, formación e incidencias.
 */

// ───────────── Alérgenos (Reglamento UE 1169/2011, anexo II)

export const ALLERGENS = [
  { key: "gluten", label: "Gluten", short: "GL" },
  { key: "crustaceos", label: "Crustáceos", short: "CR" },
  { key: "huevos", label: "Huevos", short: "HU" },
  { key: "pescado", label: "Pescado", short: "PE" },
  { key: "cacahuetes", label: "Cacahuetes", short: "CA" },
  { key: "soja", label: "Soja", short: "SO" },
  { key: "lacteos", label: "Lácteos", short: "LA" },
  { key: "frutos_cascara", label: "Frutos de cáscara", short: "FC" },
  { key: "apio", label: "Apio", short: "AP" },
  { key: "mostaza", label: "Mostaza", short: "MO" },
  { key: "sesamo", label: "Sésamo", short: "SE" },
  { key: "sulfitos", label: "Sulfitos", short: "SU" },
  { key: "altramuces", label: "Altramuces", short: "AL" },
  { key: "moluscos", label: "Moluscos", short: "ML" },
] as const;
export type AllergenKey = (typeof ALLERGENS)[number]["key"];
const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key) as [AllergenKey, ...AllergenKey[]];
export const allergenLabel = (k: string) => ALLERGENS.find((a) => a.key === k)?.label ?? k;

export const STORAGE_LABEL: Record<string, string> = { REFRIGERADO: "Refrigerado (0–4 °C)", CONGELADO: "Congelado (≤ −18 °C)", AMBIENTE: "Ambiente" };
export const FREQ_LABEL: Record<string, string> = { DIARIA: "Diaria", SEMANAL: "Semanal", MENSUAL: "Mensual" };
const FREQ_DAYS: Record<string, number> = { DIARIA: 1, SEMANAL: 7, MENSUAL: 30 };

// ───────────── Día de servicio
// El servicio termina pasada la medianoche: lo hecho antes de las 05:00 cuenta para el día anterior.

const DAY_CUTOFF_HOURS = 5;
/** Desde esta hora tocan las lecturas de cierre y la limpieza diaria. */
const CLOSING_HOUR = 21;
export function serviceDayOf(d: Date): string {
  return dateOf(new Date(d.getTime() - DAY_CUTOFF_HOURS * 3_600_000));
}
export function currentServiceDay(): string {
  return serviceDayOf(new Date());
}
/** Ventana amplia para consultar registros de un día de servicio (se filtra después). */
function around(day: string) {
  return { gte: new Date(toDbDate(day).getTime() - 6 * 3_600_000), lt: new Date(toDbDate(addDays(day, 1)).getTime() + 12 * 3_600_000) };
}

async function managers(exceptId?: string) {
  const users = await db.user.findMany({ where: { active: true } });
  return users.filter((u) => can(u, "sanidad_gestion") && u.id !== exceptId);
}

async function openNc(actor: Actor, source: string, description: string, ctx: ActionContext, relatedId?: string, correctiveAction?: string | null) {
  const closed = !!correctiveAction?.trim();
  const nc = await db.nonConformity.create({
    data: {
      source,
      description,
      relatedId,
      correctiveAction: correctiveAction?.trim() || null,
      status: closed ? "CERRADA" : "ABIERTA",
      closedById: closed ? actor.id : null,
      closedAt: closed ? new Date() : null,
      createdById: actor.id,
      viaAi: !!ctx.viaAi,
    },
  });
  const to = (await managers(actor.id)).map((u) => u.id);
  await notify(to, closed ? "Incidencia sanitaria (resuelta)" : "Incidencia sanitaria", `${description}${closed ? ` Acción: ${correctiveAction}` : " Falta la acción correctora."}`, "/sanidad/incidencias");
  return nc;
}

// ───────────── Temperaturas

export async function equipmentStatus(actor: Actor, day = currentServiceDay()) {
  assertCan(actor, "sanidad");
  const eq = await db.foodEquipment.findMany({
    where: { active: true },
    include: { logs: { where: { at: around(day) }, include: { user: { select: { shortName: true } } }, orderBy: { at: "asc" } } },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  return eq.map((e) => {
    const logs = e.logs.filter((l) => serviceDayOf(l.at) === day);
    const views = logs.map((l) => ({ id: l.id, value: l.value, outOfRange: l.outOfRange, time: timeOf(l.at), user: l.user.shortName, correctiveAction: l.correctiveAction }));
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      minTemp: e.minTemp,
      maxTemp: e.maxTemp,
      required: e.checksPerDay,
      done: Math.min(logs.length, e.checksPerDay),
      nextLabel: logs.length === 0 ? "Apertura" : logs.length === 1 && e.checksPerDay > 1 ? "Cierre" : null,
      logs: views,
      last: views.at(-1) ?? null,
    };
  });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** "cámara 1", "congelador", "nevera de bebidas", "heladera" → equipo. */
export async function findEquipment(name: string) {
  const q = norm(name).replace(/heladera|frigo(rifico)?/, "nevera").replace(/arcon/, "congelador");
  const all = await db.foodEquipment.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  // Código del equipo: "C1", "c 1", "la b3"
  const code = q.match(/\b([a-z])\s?(\d{1,2})\b/);
  if (code) {
    const byCode = all.find((e) => norm(e.name).split(/\s+/).includes(code[1] + code[2]));
    if (byCode) return byCode;
  }
  const words = q.split(/\s+/).filter((w) => w.length > 1 && !["de", "la", "el", "del"].includes(w));
  return (
    all.find((e) => norm(e.name) === q) ??
    all.find((e) => words.length && words.every((w) => norm(e.name).includes(w))) ??
    all.find((e) => words.some((w) => w.length > 3 && norm(e.name).includes(w))) ??
    null
  );
}

export const temperatureSchema = z.object({
  equipmentId: z.string().optional(),
  equipmentName: z.string().optional(),
  value: z.number().min(-40).max(120),
  correctiveAction: z.string().trim().max(500).optional().nullable(),
});

export async function recordTemperature(actor: Actor, raw: z.input<typeof temperatureSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad");
  const input = temperatureSchema.parse(raw);
  const eq = input.equipmentId
    ? await db.foodEquipment.findUnique({ where: { id: input.equipmentId } })
    : input.equipmentName
      ? await findEquipment(input.equipmentName)
      : null;
  if (!eq) throw new NotFoundError(`No encuentro el equipo "${input.equipmentName ?? ""}".`);
  const outOfRange = input.value < eq.minTemp || input.value > eq.maxTemp;
  const log = await db.temperatureLog.create({
    data: { equipmentId: eq.id, value: input.value, outOfRange, correctiveAction: input.correctiveAction || null, userId: actor.id, viaAi: !!ctx.viaAi },
  });
  const range = `${eq.minTemp} a ${eq.maxTemp} °C`;
  await audit(actor, "sanidad.temperatura", `${eq.name}: ${input.value} °C${outOfRange ? ` FUERA DE RANGO (${range})` : ""}`, ctx, { logId: log.id });
  const nc = outOfRange
    ? await openNc(actor, "TEMPERATURA", `${eq.name} a ${input.value} °C (rango ${range}).`, ctx, log.id, input.correctiveAction)
    : null;
  return { log, equipment: eq, outOfRange, range, nc };
}

export const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["REFRIGERACION", "CONGELACION", "CALIENTE"]),
  minTemp: z.number().min(-40).max(120),
  maxTemp: z.number().min(-40).max(120),
  checksPerDay: z.number().int().min(1).max(6).default(2),
  area: z.string().max(30).default("COCINA"),
});

export async function saveEquipment(actor: Actor, id: string | null, raw: z.input<typeof equipmentSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad_gestion");
  const data = equipmentSchema.parse(raw);
  if (data.minTemp > data.maxTemp) throw new ValidationError("La mínima no puede ser mayor que la máxima.");
  const e = id ? await db.foodEquipment.update({ where: { id }, data }) : await db.foodEquipment.create({ data });
  await audit(actor, "sanidad.equipo", `Equipo ${id ? "actualizado" : "creado"}: ${e.name} (${e.minTemp} a ${e.maxTemp} °C)`, ctx);
  return e;
}

export async function deactivateEquipment(actor: Actor, id: string) {
  assertCan(actor, "sanidad_gestion");
  await db.foodEquipment.update({ where: { id }, data: { active: false } });
}

// ───────────── Recepción de mercancías

export const receptionSchema = z.object({
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().trim().min(1).max(100),
  product: z.string().trim().min(1).max(150),
  temperature: z.number().min(-40).max(60).optional().nullable(),
  packagingOk: z.boolean().default(true),
  labelOk: z.boolean().default(true),
  expiryDate: z.string().refine(isISODate).optional().nullable(),
  lot: z.string().trim().max(60).optional().nullable(),
  accepted: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().nullable(),
  purchaseOrderId: z.string().optional().nullable(),
});

export async function recordReception(actor: Actor, raw: z.input<typeof receptionSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad");
  const input = receptionSchema.parse(raw);
  const expired = input.expiryDate && input.expiryDate < todayISO();
  const rec = await db.receptionCheck.create({
    data: { ...input, expiryDate: input.expiryDate ? toDbDate(input.expiryDate) : null, userId: actor.id },
  });
  const problems = [
    !input.accepted && "rechazada",
    !input.packagingOk && "envase dañado",
    !input.labelOk && "etiquetado incorrecto",
    expired && "caducada",
  ].filter(Boolean) as string[];
  await audit(actor, "sanidad.recepcion", `Recepción ${input.product} (${input.supplierName})${problems.length ? ": " + problems.join(", ") : " correcta"}`, ctx, { receptionId: rec.id });
  const nc = problems.length
    ? await openNc(actor, "RECEPCION", `${input.product} de ${input.supplierName}: ${problems.join(", ")}.`, ctx, rec.id, input.notes && !input.accepted ? `Devuelto al proveedor. ${input.notes}` : null)
    : null;
  return { reception: rec, problems, nc };
}

export async function listReceptions(actor: Actor, limit = 30) {
  assertCan(actor, "sanidad");
  return db.receptionCheck.findMany({ include: { user: { select: { shortName: true } } }, orderBy: { at: "desc" }, take: limit });
}

// ───────────── Limpieza

export async function cleaningStatus(actor: Actor, day = currentServiceDay()) {
  assertCan(actor, "sanidad");
  const items = await db.cleaningItem.findMany({
    where: { active: true },
    include: {
      logs: { where: { at: { gte: new Date(toDbDate(addDays(day, -31)).getTime()) } }, include: { user: { select: { shortName: true } } }, orderBy: { at: "desc" } },
    },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  return items.map((i) => {
    const last = i.logs[0] ?? null;
    const lastDay = last ? serviceDayOf(last.at) : null;
    const period = FREQ_DAYS[i.frequency] ?? 1;
    const doneThisPeriod = !!lastDay && lastDay > addDays(day, -period);
    const doneToday = lastDay === day;
    return {
      id: i.id,
      name: i.name,
      area: i.area,
      frequency: i.frequency,
      method: i.method,
      due: !doneThisPeriod,
      doneToday,
      last: last ? { day: lastDay!, time: timeOf(last.at), user: last.user.shortName } : null,
    };
  });
}

export async function findCleaningItem(name: string) {
  const q = norm(name);
  const all = await db.cleaningItem.findMany({ where: { active: true } });
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  return (
    all.find((i) => norm(i.name) === q) ??
    all.find((i) => words.length && words.every((w) => norm(i.name).includes(w.replace(/s$/, "")))) ??
    all.find((i) => words.some((w) => norm(i.name).includes(w.replace(/s$/, "")))) ??
    null
  );
}

export async function recordCleaning(actor: Actor, raw: { itemId?: string; itemName?: string; notes?: string }, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad");
  const item = raw.itemId ? await db.cleaningItem.findUnique({ where: { id: raw.itemId } }) : raw.itemName ? await findCleaningItem(raw.itemName) : null;
  if (!item) throw new NotFoundError(`No encuentro "${raw.itemName ?? ""}" en el plan de limpieza.`);
  const log = await db.cleaningLog.create({ data: { itemId: item.id, userId: actor.id, notes: raw.notes?.slice(0, 300) || null, viaAi: !!ctx.viaAi } });
  await audit(actor, "sanidad.limpieza", `Limpieza: ${item.name}`, ctx, { cleaningLogId: log.id });
  return { log, item };
}

export const cleaningItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  area: z.string().trim().min(1).max(30),
  frequency: z.enum(["DIARIA", "SEMANAL", "MENSUAL"]),
  method: z.string().trim().max(200).optional().nullable(),
});

export async function saveCleaningItem(actor: Actor, id: string | null, raw: z.input<typeof cleaningItemSchema>) {
  assertCan(actor, "sanidad_gestion");
  const data = cleaningItemSchema.parse(raw);
  return id ? db.cleaningItem.update({ where: { id }, data }) : db.cleaningItem.create({ data });
}

export async function deactivateCleaningItem(actor: Actor, id: string) {
  assertCan(actor, "sanidad_gestion");
  await db.cleaningItem.update({ where: { id }, data: { active: false } });
}

// ───────────── Elaboraciones y etiquetas

async function nextLot(day: string) {
  const prefix = day.slice(2).replace(/-/g, "");
  const count = await db.elaboration.count({ where: { lot: { startsWith: prefix + "-" } } });
  return `${prefix}-${String(count + 1).padStart(2, "0")}`;
}

/** Caduca al final del día (23:59 hora local aprox.) tras la vida útil. */
function expiryFrom(day: string, days: number) {
  return new Date(toDbDate(addDays(day, days)).getTime() + 21 * 3_600_000);
}

export const elaborationSchema = z.object({
  typeId: z.string().optional().nullable(),
  typeName: z.string().optional().nullable(),
  name: z.string().trim().max(100).optional().nullable(),
  quantity: z.number().positive().max(10000).optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
  storage: z.enum(["REFRIGERADO", "CONGELADO", "AMBIENTE"]).optional().nullable(),
  shelfLifeDays: z.number().int().min(0).max(365).optional().nullable(),
  allergens: z.array(z.enum(ALLERGEN_KEYS)).optional().nullable(),
});

export async function findElaborationType(name: string) {
  const q = norm(name).replace(/s$/, "");
  const all = await db.elaborationType.findMany({ where: { active: true } });
  return all.find((t) => norm(t.name) === q) ?? all.find((t) => norm(t.name).includes(q) || q.includes(norm(t.name).split(" ")[0])) ?? null;
}

export async function createElaboration(actor: Actor, raw: z.input<typeof elaborationSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad");
  const input = elaborationSchema.parse(raw);
  const type = input.typeId
    ? await db.elaborationType.findUnique({ where: { id: input.typeId } })
    : input.typeName
      ? await findElaborationType(input.typeName)
      : null;
  const name = input.name || type?.name;
  if (!name) throw new ValidationError("Decime qué elaboraste.");
  const shelf = input.shelfLifeDays ?? type?.shelfLifeDays;
  if (shelf == null) throw new ValidationError(`No sé cuántos días dura "${name}". Indicá la vida útil.`);
  const day = currentServiceDay();
  const e = await db.elaboration.create({
    data: {
      lot: await nextLot(day),
      typeId: type?.id ?? null,
      name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? type?.unit ?? null,
      storage: input.storage ?? type?.storage ?? "REFRIGERADO",
      allergens: input.allergens ?? type?.allergens ?? [],
      expiresAt: expiryFrom(day, shelf),
      userId: actor.id,
      viaAi: !!ctx.viaAi,
    },
  });
  await audit(actor, "sanidad.elaboracion", `Elaboración ${e.name}${e.quantity ? ` (${e.quantity} ${e.unit ?? ""})` : ""}, lote ${e.lot}, caduca ${dateOf(e.expiresAt)}`, ctx, { elaborationId: e.id });
  return e;
}

export async function listElaborations(actor: Actor, status: "EN_USO" | "TODAS" = "EN_USO") {
  assertCan(actor, "sanidad");
  return db.elaboration.findMany({
    where: status === "EN_USO" ? { status: "EN_USO" } : {},
    include: { user: { select: { shortName: true } } },
    orderBy: status === "EN_USO" ? { expiresAt: "asc" } : { madeAt: "desc" },
    take: 100,
  });
}

export async function getElaboration(actor: Actor, id: string) {
  assertCan(actor, "sanidad");
  const e = await db.elaboration.findUnique({ where: { id }, include: { user: { select: { shortName: true } } } });
  if (!e) throw new NotFoundError("Elaboración no encontrada.");
  return e;
}

export async function setElaborationStatus(actor: Actor, id: string, status: "CONSUMIDO" | "DESECHADO", reason?: string, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad");
  const e = await db.elaboration.findUnique({ where: { id } });
  if (!e) throw new NotFoundError("Elaboración no encontrada.");
  const updated = await db.elaboration.update({ where: { id }, data: { status, discardReason: status === "DESECHADO" ? reason?.slice(0, 200) || "Caducado" : null } });
  await audit(actor, "sanidad.elaboracion", `${e.name} (lote ${e.lot}): ${status === "CONSUMIDO" ? "consumido" : `desechado (${updated.discardReason})`}`, ctx);
  return updated;
}

export function expiryState(expiresAt: Date, now = new Date()) {
  const today = serviceDayOf(now);
  const day = dateOf(expiresAt);
  if (expiresAt < now) return "caducado" as const;
  if (day <= today) return "hoy" as const;
  if (day === addDays(today, 1)) return "mañana" as const;
  return "ok" as const;
}

export async function listElaborationTypes() {
  return db.elaborationType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export const elaborationTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shelfLifeDays: z.number().int().min(0).max(365),
  storage: z.enum(["REFRIGERADO", "CONGELADO", "AMBIENTE"]),
  allergens: z.array(z.enum(ALLERGEN_KEYS)).default([]),
  unit: z.string().trim().max(20).default("kg"),
});

export async function saveElaborationType(actor: Actor, id: string | null, raw: z.input<typeof elaborationTypeSchema>) {
  assertCan(actor, "sanidad_gestion");
  const data = elaborationTypeSchema.parse(raw);
  return id ? db.elaborationType.update({ where: { id }, data }) : db.elaborationType.create({ data });
}

// ───────────── Alérgenos de la carta

export async function listDishes() {
  return db.dish.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] });
}

export const dishSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(40),
  allergens: z.array(z.enum(ALLERGEN_KEYS)).default([]),
  traces: z.array(z.enum(ALLERGEN_KEYS)).default([]),
});

export async function saveDish(actor: Actor, id: string | null, raw: z.input<typeof dishSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad_gestion");
  const data = dishSchema.parse(raw);
  const d = id ? await db.dish.update({ where: { id }, data }) : await db.dish.create({ data });
  await audit(actor, "sanidad.alergenos", `Alérgenos de ${d.name}: ${d.allergens.map(allergenLabel).join(", ") || "ninguno"}`, ctx);
  return d;
}

export async function deactivateDish(actor: Actor, id: string) {
  assertCan(actor, "sanidad_gestion");
  await db.dish.update({ where: { id }, data: { active: false } });
}

// ───────────── Plagas y formación

export const pestSchema = z.object({
  date: z.string().refine(isISODate),
  company: z.string().trim().min(1).max(100),
  kind: z.enum(["REVISION", "TRATAMIENTO", "INCIDENCIA"]),
  notes: z.string().trim().max(1000).optional().nullable(),
  nextVisit: z.string().refine(isISODate).optional().nullable(),
});

export async function listPestVisits(actor: Actor) {
  assertCan(actor, "sanidad");
  return db.pestControlVisit.findMany({ include: { user: { select: { shortName: true } } }, orderBy: { date: "desc" }, take: 30 });
}

export async function recordPestVisit(actor: Actor, raw: z.input<typeof pestSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad_gestion");
  const input = pestSchema.parse(raw);
  const v = await db.pestControlVisit.create({
    data: { ...input, date: toDbDate(input.date), nextVisit: input.nextVisit ? toDbDate(input.nextVisit) : null, userId: actor.id },
  });
  await audit(actor, "sanidad.plagas", `Control de plagas (${input.kind.toLowerCase()}): ${input.company}`, ctx);
  if (input.kind === "INCIDENCIA") await openNc(actor, "PLAGAS", `Incidencia de plagas: ${input.notes ?? "sin detalle"}`, ctx, v.id);
  return v;
}

export const trainingSchema = z.object({
  userId: z.string(),
  title: z.string().trim().min(1).max(120),
  provider: z.string().trim().max(100).optional().nullable(),
  issuedAt: z.string().refine(isISODate),
  expiresAt: z.string().refine(isISODate).optional().nullable(),
});

export async function listTrainings(actor: Actor) {
  assertCan(actor, "sanidad");
  return db.trainingCert.findMany({
    where: can(actor, "sanidad_gestion") ? {} : { userId: actor.id },
    include: { user: { select: { shortName: true, name: true } } },
    orderBy: [{ expiresAt: "asc" }],
  });
}

export async function recordTraining(actor: Actor, raw: z.input<typeof trainingSchema>, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad_gestion");
  const input = trainingSchema.parse(raw);
  const t = await db.trainingCert.create({
    data: { ...input, issuedAt: toDbDate(input.issuedAt), expiresAt: input.expiresAt ? toDbDate(input.expiresAt) : null },
    include: { user: true },
  });
  await audit(actor, "sanidad.formacion", `Formación de ${t.user.shortName}: ${t.title}`, ctx);
  return t;
}

// ───────────── Incidencias (no conformidades)

export async function listNonConformities(actor: Actor, status: "ABIERTA" | "TODAS" = "TODAS") {
  assertCan(actor, "sanidad");
  return db.nonConformity.findMany({
    where: status === "ABIERTA" ? { status: "ABIERTA" } : {},
    include: { createdBy: { select: { shortName: true } }, closedBy: { select: { shortName: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
  });
}

export async function reportNonConformity(actor: Actor, raw: { description: string; source?: string; correctiveAction?: string }, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad");
  const description = z.string().trim().min(3).max(500).parse(raw.description);
  const source = z.enum(["TEMPERATURA", "RECEPCION", "LIMPIEZA", "ELABORACION", "PLAGAS", "OTRO"]).default("OTRO").parse(raw.source);
  await audit(actor, "sanidad.incidencia", `Incidencia: ${description}`, ctx);
  return openNc(actor, source, description, ctx, undefined, raw.correctiveAction);
}

export async function closeNonConformity(actor: Actor, id: string, correctiveAction: string, ctx: ActionContext = {}) {
  assertCan(actor, "sanidad_gestion");
  const action = z.string().trim().min(3, "Describí la acción correctora").max(500).parse(correctiveAction);
  const nc = await db.nonConformity.update({ where: { id }, data: { status: "CERRADA", correctiveAction: action, closedById: actor.id, closedAt: new Date() } });
  await audit(actor, "sanidad.incidencia", `Incidencia cerrada: ${nc.description} Acción: ${action}`, ctx);
  return nc;
}

// ───────────── Resumen del día

export async function foodSafetyDashboard(actor: Actor) {
  assertCan(actor, "sanidad");
  const day = currentServiceDay();
  const now = new Date();
  const [equipment, cleaning, elaborations, ncs, trainings, pest] = await Promise.all([
    equipmentStatus(actor, day),
    cleaningStatus(actor, day),
    db.elaboration.findMany({ where: { status: "EN_USO", expiresAt: { lt: expiryFrom(day, 1) } }, orderBy: { expiresAt: "asc" } }),
    db.nonConformity.findMany({ where: { status: "ABIERTA" }, orderBy: { createdAt: "desc" } }),
    can(actor, "sanidad_gestion")
      ? db.trainingCert.findMany({ where: { expiresAt: { lt: toDbDate(addDays(day, 60)) } }, include: { user: { select: { shortName: true } } } })
      : Promise.resolve([]),
    db.pestControlVisit.findFirst({ orderBy: { date: "desc" } }),
  ]);
  // Lo que ya toca: la lectura de apertura siempre; la de cierre y la limpieza diaria, desde las 21:00.
  const hour = Number(timeOf(now).slice(0, 2));
  const closing = hour >= CLOSING_HOUR || hour < DAY_CUTOFF_HOURS;
  const tempsPending = equipment.filter((e) => e.done < (closing ? e.required : Math.min(1, e.required)));
  const cleaningDue = cleaning.filter((c) => c.due);
  const pestOverdue = pest?.nextVisit && dateOf(pest.nextVisit) < day ? pest : null;
  const pending =
    tempsPending.length +
    (closing ? cleaningDue.filter((c) => c.frequency === "DIARIA").length : 0) +
    elaborations.filter((e) => e.expiresAt < now).length +
    ncs.length;
  return {
    day,
    equipment,
    tempsPending,
    cleaning,
    cleaningDue,
    expiring: elaborations.map((e) => ({ id: e.id, name: e.name, lot: e.lot, expiresAt: e.expiresAt, state: expiryState(e.expiresAt, now) })),
    openNcs: ncs,
    trainingsExpiring: trainings,
    pestOverdue,
    pending,
  };
}

/** Número para el contador de la Home. */
export async function foodSafetyPendingCount(actor: Actor) {
  if (!can(actor, "sanidad")) return 0;
  return (await foodSafetyDashboard(actor)).pending;
}

// ───────────── Informe para inspección

export async function foodSafetyReport(actor: Actor, from: string, to: string) {
  assertCan(actor, "sanidad_gestion");
  if (!isISODate(from) || !isISODate(to) || from > to) throw new ValidationError("Rango de fechas no válido.");
  const range = { gte: new Date(toDbDate(from).getTime() - 2 * 3_600_000), lt: new Date(toDbDate(addDays(to, 1)).getTime() + 3 * 3_600_000) };
  const inRange = (d: Date) => {
    const s = serviceDayOf(d);
    return s >= from && s <= to;
  };
  const [temps, receptions, cleaning, elaborations, ncs, pest, trainings] = await Promise.all([
    db.temperatureLog.findMany({ where: { at: range }, include: { equipment: true, user: { select: { shortName: true } } }, orderBy: { at: "asc" } }),
    db.receptionCheck.findMany({ where: { at: range }, include: { user: { select: { shortName: true } } }, orderBy: { at: "asc" } }),
    db.cleaningLog.findMany({ where: { at: range }, include: { item: true, user: { select: { shortName: true } } }, orderBy: { at: "asc" } }),
    db.elaboration.findMany({ where: { madeAt: range }, include: { user: { select: { shortName: true } } }, orderBy: { madeAt: "asc" } }),
    db.nonConformity.findMany({ where: { createdAt: range }, include: { createdBy: { select: { shortName: true } }, closedBy: { select: { shortName: true } } }, orderBy: { createdAt: "asc" } }),
    db.pestControlVisit.findMany({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } }, orderBy: { date: "asc" } }),
    db.trainingCert.findMany({ include: { user: { select: { shortName: true, name: true } } }, orderBy: { userId: "asc" } }),
  ]);
  return {
    from,
    to,
    temps: temps.filter((t) => inRange(t.at)),
    receptions: receptions.filter((r) => inRange(r.at)),
    cleaning: cleaning.filter((c) => inRange(c.at)),
    elaborations: elaborations.filter((e) => inRange(e.madeAt)),
    ncs: ncs.filter((n) => inRange(n.createdAt)),
    pest,
    trainings,
  };
}
