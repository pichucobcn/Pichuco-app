import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { addDays, todayISO, toDbDate } from "../lib/dates";
import { availableDatasets, DATASETS, exportCsv } from "../lib/services/exportar";

before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("fichajes: un turno de 19:00 a 01:00 es una sola jornada de 5:45 (con pausa)", async () => {
  const eva = await user("eva@pichuco.es");
  const martin = await user("martin@pichuco.es");
  const day = addDays(todayISO(), -3);
  // 19:00 en Madrid = 17:00 UTC (horario de verano) o 18:00 (invierno); usamos toDbDate (00:00 UTC) + horas locales aprox.
  const base = toDbDate(day).getTime();
  const at = (h: number, m = 0) => new Date(base + (h - 2) * 3_600_000 + m * 60_000);
  for (const [type, d] of [["ENTRADA", at(19)], ["PAUSA_INICIO", at(21)], ["PAUSA_FIN", at(21, 15)], ["SALIDA", at(25)]] as const)
    await db.clockEvent.create({ data: { userId: eva.id, type, at: d } });
  const { body, count } = await exportCsv(martin, "fichajes");
  assert.ok(body.startsWith("﻿Fecha;Persona;Entrada;Salida;Pausas;Horas trabajadas"));
  const lines = body.split("\r\n").filter((l) => l.includes("Eva Fort"));
  assert.equal(lines.length, 1, body);
  assert.match(lines[0], new RegExp(`^${day};Eva Fort;\\d\\d:00;\\d\\d:00;\\d\\d:00–\\d\\d:15;5:45;`));
  assert.ok(count >= 1);
});

test("todos los conjuntos se exportan con todo el histórico", async () => {
  const martin = await user("martin@pichuco.es");
  for (const d of DATASETS) {
    const r = await exportCsv(martin, d.key);
    assert.ok(r.body.length > 10, d.key);
  }
  const temps = await exportCsv(martin, "temperaturas");
  assert.ok(temps.count > 10);
  assert.match(temps.body, /Nevera B1;9,5;0 a 4;Fuera de rango/);
  const limited = await exportCsv(martin, "temperaturas", todayISO(), todayISO());
  assert.ok(limited.count < temps.count);
});

test("permisos: Gian exporta sanidad pero no fichajes; Eva nada", async () => {
  const gian = await user("gian@pichuco.es");
  const eva = await user("eva@pichuco.es");
  await assert.rejects(exportCsv(gian, "fichajes"), /permiso/i);
  assert.ok((await exportCsv(gian, "temperaturas")).count > 0);
  assert.deepEqual(availableDatasets(eva), []);
  await assert.rejects(exportCsv(eva, "temperaturas"), /permiso/i);
});
