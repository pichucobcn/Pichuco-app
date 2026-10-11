import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { addDays, todayISO } from "../lib/dates";
import { createTask, listTasks, completeTask } from "../lib/services/tasks";

before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("Juan Pablo se anota tareas para mañana, las tacha y ve lo que le queda", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const tomorrow = addDays(todayISO(), 1);
  const a = await createTask(jp, { title: "Masa para 40 pizzas", date: tomorrow });
  const b = await createTask(jp, { title: "Salsa de tomate 5 l", date: tomorrow });
  assert.equal(a.assigneeId, jp.id);
  await completeTask(jp, a.id);
  const list = await listTasks(jp, { date: tomorrow });
  assert.equal(list.find((t) => t.id === a.id)?.status, "COMPLETADA");
  assert.equal(list.find((t) => t.id === b.id)?.status, "PENDIENTE");
});

test("lo que no se terminó ayer aparece como pendiente de días anteriores", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const t = await createTask(jp, { title: "Ordenar cámara C2", date: addDays(todayISO(), -1) });
  const late = await listTasks(jp, { status: "ABIERTAS", to: addDays(todayISO(), -1) });
  assert.ok(late.some((x) => x.id === t.id));
  await completeTask(jp, t.id);
  const after = await listTasks(jp, { status: "ABIERTAS", to: addDays(todayISO(), -1) });
  assert.ok(!after.some((x) => x.id === t.id));
});
