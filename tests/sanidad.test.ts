import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { localAgent } from "../lib/ai/local";
import {
  closeNonConformity,
  createElaboration,
  foodSafetyDashboard,
  foodSafetyReport,
  recordReception,
  recordTemperature,
  saveDish,
  saveEquipment,
  serviceDayOf,
} from "../lib/services/sanidad";
import { addDays, todayISO } from "../lib/dates";

before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());

const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("día de servicio: después de medianoche cuenta para el día anterior", () => {
  // 00:30 en Barcelona (CEST) = 22:30 UTC del día anterior
  assert.equal(serviceDayOf(new Date("2026-10-10T22:30:00Z")), "2026-10-10");
  assert.equal(serviceDayOf(new Date("2026-10-11T05:00:00Z")), "2026-10-11");
});

test("temperatura en rango: sin incidencia", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const r = await recordTemperature(jp, { equipmentName: "C2", value: 3 });
  assert.equal(r.outOfRange, false);
  assert.equal(r.nc, null);
});

test("temperatura fuera de rango: abre incidencia y avisa a Gian y Martín", async () => {
  const eva = await user("eva@pichuco.es");
  const r = await recordTemperature(eva, { equipmentName: "nevera B1", value: 11 });
  assert.equal(r.outOfRange, true);
  assert.equal(r.nc?.status, "ABIERTA");
  const notes = await db.notification.findMany({ where: { title: "Incidencia sanitaria" }, include: { user: true } });
  assert.deepEqual(notes.map((n) => n.user.shortName).sort(), ["Gian", "Martín"]);
  // Eva no puede cerrarla; Gian sí, con acción correctora
  await assert.rejects(closeNonConformity(eva, r.nc!.id, "Cerré la puerta"), /permiso/);
  const gian = await user("gian@pichuco.es");
  await assert.rejects(closeNonConformity(gian, r.nc!.id, ""), /acción correctora/);
  const closed = await closeNonConformity(gian, r.nc!.id, "Se ajustó el termostato y se volvió a medir: 6 °C");
  assert.equal(closed.status, "CERRADA");
});

test("con acción correctora dicha, la incidencia queda cerrada", async () => {
  const gian = await user("gian@pichuco.es");
  const r = await recordTemperature(gian, { equipmentName: "C7", value: -12, correctiveAction: "Se pasó el producto a la cámara de respaldo" });
  assert.equal(r.nc?.status, "CERRADA");
});

test("elaboración: lote y caducidad según la vida útil del tipo", async () => {
  const gian = await user("gian@pichuco.es");
  const e = await createElaboration(gian, { typeName: "masa", quantity: 8 });
  assert.equal(e.name, "Masa de pizza");
  assert.deepEqual(e.allergens, ["gluten"]);
  assert.match(e.lot, /^\d{6}-\d{2}$/);
  const days = Math.round((e.expiresAt.getTime() - e.madeAt.getTime()) / 86_400_000);
  assert.ok(days >= 2 && days <= 4, `vida útil ${days}`);
  await assert.rejects(createElaboration(gian, { name: "Algo raro" }), /vida útil/);
});

test("recepción rechazada genera incidencia", async () => {
  const gian = await user("gian@pichuco.es");
  const r = await recordReception(gian, { supplierName: "Carns Sants", product: "Peceto 5 kg", temperature: 9, accepted: false, notes: "Llegó caliente" });
  assert.deepEqual(r.problems, ["rechazada"]);
  assert.equal(r.nc?.source, "RECEPCION");
});

test("resumen del día: temperaturas pendientes, caducados e incidencias", async () => {
  const martin = await user("martin@pichuco.es");
  const d = await foodSafetyDashboard(martin);
  assert.ok(d.tempsPending.length > 0);
  assert.ok(d.expiring.some((e) => e.state === "caducado" && e.name === "Salsa de tomate"));
  assert.ok(d.expiring.some((e) => e.state === "hoy" && e.name === "Masa de pizza"));
  assert.ok(d.cleaningDue.some((c) => c.name.startsWith("Campana")));
  assert.ok(d.trainingsExpiring.some((t) => t.user.shortName === "Gian"));
});

test("equipos reales: 8 neveras y 2 congeladores, sin los de prueba", async () => {
  const eq = await db.foodEquipment.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  assert.deepEqual(eq.map((e) => e.name), ["Nevera B1", "Nevera B2", "Congelador B3", "Nevera C1", "Nevera C2", "Nevera C3", "Nevera C4", "Nevera C5", "Nevera C6", "Congelador C7"]);
  const { loadEquipment } = await import("../prisma/equipos");
  await loadEquipment(db as unknown as import("@prisma/client").PrismaClient);
  assert.equal(await db.foodEquipment.count({ where: { active: true } }), 10);
});

test("sólo los responsables gestionan equipos y alérgenos", async () => {
  const jp = await user("juanpablo@pichuco.es");
  await assert.rejects(saveEquipment(jp, null, { name: "Cámara 3", kind: "REFRIGERACION", minTemp: 0, maxTemp: 4 }), /permiso/);
  await assert.rejects(saveDish(jp, null, { name: "X", category: "Pizzas", allergens: ["gluten"] }), /permiso/);
});

test("informe: incluye los registros del período", async () => {
  const martin = await user("martin@pichuco.es");
  const r = await foodSafetyReport(martin, addDays(todayISO(), -7), todayISO());
  assert.ok(r.temps.length > 10);
  assert.ok(r.cleaning.length > 3);
  const jp = await user("juanpablo@pichuco.es");
  await assert.rejects(foodSafetyReport(jp, addDays(todayISO(), -7), todayISO()), /permiso/);
});

test("Pichuco AI: temperaturas, limpieza, elaboraciones y estado", async () => {
  const jp = await user("juanpablo@pichuco.es");
  let r = await localAgent(jp, "La C1 está a 3 grados");
  assert.match(r.text, /Nevera C1.*3 °C.*en rango/);
  r = await localAgent(jp, "la c 3 está a 9°");
  assert.match(r.text, /Nevera C3.*fuera de rango/);
  r = await localAgent(jp, "B3 a -19");
  assert.match(r.text, /Congelador B3.*-19 °C.*en rango/);
  r = await localAgent(jp, "Limpié la campana");
  assert.match(r.text, /campana/i);
  r = await localAgent(jp, "Hice 10 kg de masa");
  assert.match(r.text, /lote \d{6}-\d{2}/);
  assert.match(r.text, /gluten/);
  r = await localAgent(jp, "¿Qué controles faltan?");
  assert.match(r.text, /Temperaturas por tomar/);
});

test("control semanal de neveras: inicio el miércoles, fin el lunes, martes cerrado", async () => {
  const { tempWeek, equipmentStatus } = await import("../lib/services/sanidad");
  assert.deepEqual(tempWeek("2026-10-12"), { start: "2026-10-07", end: "2026-10-12" }); // lunes
  assert.deepEqual(tempWeek("2026-10-13"), { start: "2026-10-07", end: "2026-10-12" }); // martes (cerrado)
  assert.deepEqual(tempWeek("2026-10-14"), { start: "2026-10-14", end: "2026-10-19" }); // miércoles
  const gian = await user("gian@pichuco.es");
  const eq = await db.foodEquipment.create({ data: { name: "Nevera T9", kind: "REFRIGERACION", minTemp: 0, maxTemp: 4, sort: 99 } });
  const st = async (day: string) => (await equipmentStatus(gian, day)).find((e) => e.id === eq.id)!;
  // 19:00 en Madrid ≈ 17:00 UTC
  const at = (day: string) => new Date(new Date(day + "T17:00:00Z").getTime());
  let s = await st("2026-10-14");
  assert.equal(s.due, true);
  assert.equal(s.nextLabel, "Inicio de semana");
  await db.temperatureLog.create({ data: { equipmentId: eq.id, value: 3, at: at("2026-10-14"), userId: gian.id } });
  s = await st("2026-10-16");
  assert.equal(s.due, false);
  assert.equal(s.done, 1);
  s = await st("2026-10-19");
  assert.equal(s.due, true);
  assert.equal(s.nextLabel, "Fin de semana");
  await db.temperatureLog.create({ data: { equipmentId: eq.id, value: 3.5, at: at("2026-10-19"), userId: gian.id } });
  s = await st("2026-10-19");
  assert.equal(s.done, 2);
  assert.equal(s.due, false);
  s = await st("2026-10-20");
  assert.equal(s.due, false);
  await db.foodEquipment.update({ where: { id: eq.id }, data: { active: false } });
});
