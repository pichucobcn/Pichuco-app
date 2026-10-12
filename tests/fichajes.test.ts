import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { addDays, todayISO, toDbDate, parseSpanishDate } from "../lib/dates";
import { localAgent } from "../lib/ai/local";
import { executeTool } from "../lib/ai/tools";

before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("'ayer' se entiende como fecha", () => {
  assert.equal(parseSpanishDate("¿a qué hora fichó ayer Juan?", "2026-10-12"), "2026-10-11");
});

test("¿a qué hora fichó ayer Juan Pablo? — Martín lo ve; Juan Pablo ve el suyo; Eva no ve el de otros", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const yesterday = addDays(todayISO(), -1);
  const base = toDbDate(yesterday).getTime();
  const at = (h: number, m = 0) => new Date(base + (h - 2) * 3_600_000 + m * 60_000);
  await db.clockEvent.createMany({
    data: [
      { userId: jp.id, type: "ENTRADA", at: at(16, 2) },
      { userId: jp.id, type: "SALIDA", at: at(24, 10) },
    ],
  });
  const martin = await user("martin@pichuco.es");
  const r = await executeTool(martin, "get_clock_records", { person: "Juan", date: yesterday }, { viaAi: true });
  assert.equal(r.isError, false, r.content);
  const data = JSON.parse(r.content);
  assert.equal(data.days.length, 1);
  assert.equal(data.days[0].person, "Juan Pablo");
  assert.equal(data.days[0].sinSalida, false);
  assert.equal(data.days[0].horas, "8 h 08 min");

  const local = await localAgent(martin, "¿A qué hora fichó ayer Juan?");
  assert.match(local.text, /Juan Pablo: entrada \d\d:02, salida \d\d:10/);

  const own = await localAgent(jp, "¿cuántas horas hice ayer?");
  assert.match(own.text, /Juan Pablo/);

  const eva = await user("eva@pichuco.es");
  const denied = await executeTool(eva, "get_clock_records", { person: "Juan Pablo", date: yesterday }, { viaAi: true });
  assert.equal(denied.isError, true);
});
