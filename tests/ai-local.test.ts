import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { localAgent } from "../lib/ai/local";
import { parseSpanishDate, addDays, todayISO, toDbDate } from "../lib/dates";
import { createAnnouncement } from "../lib/services/announcements";
import { teamClock, clock } from "../lib/services/clock";

// Estos tests usan la base de datos de DATABASE_URL y la re-siembran.
before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());

const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("fechas en castellano", () => {
  const today = "2026-10-10"; // sábado
  assert.equal(parseSpanishDate("mañana llego tarde", today), "2026-10-11");
  assert.equal(parseSpanishDate("pasado mañana", today), "2026-10-12");
  assert.equal(parseSpanishDate("esta noche", today), today);
  assert.equal(parseSpanishDate("el viernes", today), "2026-10-16");
  assert.equal(parseSpanishDate("el 12/10", today), "2026-10-12");
  assert.equal(parseSpanishDate("por la mañana", today), null);
});

test("retraso de Juan Pablo detecta la entrega de harina y avisa a Gian, sin el motivo", async () => {
  const jp = await user("juanpablo@pichuco.es");
  // Turno puntual de mañana a las 18:00 (reemplaza el horario semanal): la harina llega 18:15.
  await db.shift.create({ data: { userId: jp.id, date: toDbDate(addDays(todayISO(), 1)), start: "18:00", end: "00:00" } });
  const r = await localAgent(jp, "Mañana llego 30 minutos tarde porque tengo médico.");
  assert.match(r.text, /30 minutos tarde/);
  assert.match(r.text, /harina/i);
  assert.match(r.text, /Gian/);
  const inc = await db.incident.findFirstOrThrow({ where: { userId: jp.id } });
  assert.equal(inc.minutes, 30);
  assert.equal(inc.reason, "tengo médico");
  const notes = await db.notification.findMany({ where: { title: { startsWith: "Retraso" } }, include: { user: true } });
  const recipients = notes.map((n) => n.user.shortName).sort();
  assert.deepEqual(recipients, ["Gian", "Martín"]); // hay conflicto → también el jefe; Eva no
  for (const n of notes) assert.doesNotMatch(n.body, /médico/);
});

test("producción por lenguaje natural", async () => {
  const gian = await user("gian@pichuco.es");
  const r = await localAgent(gian, "Mañana hay que preparar 10 milanesas");
  assert.equal(r.actions[0]?.ok, true);
  const t = await db.task.findFirstOrThrow({ where: { title: { contains: "milanesas" } } });
  assert.equal(t.kind, "PRODUCCION");
  assert.equal(t.quantity, 10);
  assert.equal(t.title, "10 milanesas");
});

test("avisos a una persona concreta", async () => {
  const martin = await user("martin@pichuco.es");
  const r = await localAgent(martin, "Avisale a Gian que mañana llega harina a las 18");
  assert.match(r.text, /Gian/);
  const gian = await user("gian@pichuco.es");
  assert.ok(await db.notification.findFirst({ where: { userId: gian.id, title: "Mensaje de Martín" } }));
});

test("resumen de mañana", async () => {
  const martin = await user("martin@pichuco.es");
  const r = await localAgent(martin, "¿Qué tenemos mañana?");
  assert.match(r.text, /MAÑANA EN PICHUCO/);
  assert.match(r.text, /ENTREGAS/);
  assert.doesNotMatch(r.text, /\p{Extended_Pictographic}/u);
  assert.match(r.text, /Harina 18:15/);
});

test("permisos en backend: una camarera no publica comunicados ni ve fichajes del equipo", async () => {
  const eva = await user("eva@pichuco.es");
  await assert.rejects(createAnnouncement(eva, { title: "x", body: "y" }), /responsables/);
  await assert.rejects(teamClock(eva, addDays("2026-10-10", 0)), /permiso/);
  const r = await localAgent(eva, "Comunicado: mañana cerramos antes");
  assert.equal(r.actions[0]?.ok, false);
});

test("fichaje respeta la secuencia", async () => {
  const eva = await user("eva@pichuco.es");
  await assert.rejects(clock(eva, "SALIDA", undefined), /No podés/);
  await clock(eva, "ENTRADA", undefined);
  await clock(eva, "PAUSA_INICIO", undefined);
  await assert.rejects(clock(eva, "SALIDA", undefined), /No podés/);
});

test("horario semanal: el viernes trabajan Gian, Juan Pablo, Eva y Martín; un turno con fecha lo reemplaza", async () => {
  const { shiftsForDate, shiftFor } = await import("../lib/services/team");
  let friday = todayISO();
  while (new Date(friday + "T00:00:00Z").getUTCDay() !== 5) friday = addDays(friday, 1);
  const s = await shiftsForDate(friday);
  assert.deepEqual(s.map((x) => `${x.user.shortName} ${x.start}-${x.end}`), ["Gian 17:00-00:00", "Juan Pablo 17:00-00:00", "Eva 19:00-01:00", "Martín 19:00-01:00"]);
  let tuesday = friday;
  while (new Date(tuesday + "T00:00:00Z").getUTCDay() !== 2) tuesday = addDays(tuesday, 1);
  assert.equal((await shiftsForDate(tuesday)).length, 0);
  const eva = await user("eva@pichuco.es");
  await db.shift.create({ data: { userId: eva.id, date: toDbDate(friday), start: "20:00", end: "00:00" } });
  assert.equal((await shiftFor(eva.id, friday))?.start, "20:00");
  assert.equal((await shiftsForDate(friday)).filter((x) => x.userId === eva.id).length, 1);
});
