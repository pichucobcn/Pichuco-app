import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { POST as login } from "../app/api/auth/login/route";
import { POST as setup } from "../app/api/auth/setup/route";
import { resetPassword, loginRoster } from "../lib/services/team";

before(() => {
  delete process.env.PICHUCO_ACCESS_CODE; // en tests el código del equipo es "pichuco"
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore" });
});
after(() => db.$disconnect());

const call = async (fn: (r: Request) => Promise<Response>, body: object, ip = "1.1.1.1") => {
  const res = await fn(new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } }));
  return { status: res.status, body: await res.json(), cookie: res.headers.get("set-cookie") };
};
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("primera vez: código del equipo, elegir contraseña y entrar; después, con la propia", async () => {
  const eva = await user("eva@pichuco.es");
  assert.equal((await loginRoster()).find((p) => p.id === eva.id)?.hasPassword, false);

  assert.equal((await call(login, { userId: eva.id, password: "otra-cosa" })).status, 401);
  const first = await call(login, { userId: eva.id, password: "PICHUCO" });
  assert.deepEqual(first.body, { setup: true });
  assert.equal(first.cookie, null); // todavía no hay sesión

  assert.equal((await call(setup, { userId: eva.id, teamCode: "pichuco", password: "123" })).status, 400);
  assert.equal((await call(setup, { userId: eva.id, teamCode: "mal", password: "evita2026" })).status, 401);
  const ok = await call(setup, { userId: eva.id, teamCode: "pichuco", password: "evita2026" });
  assert.equal(ok.status, 200);
  assert.match(ok.cookie ?? "", /pichuco_session=/);

  // Ya no sirve el código del equipo; sí su contraseña
  assert.equal((await call(login, { userId: eva.id, password: "pichuco" })).status, 401);
  const again = await call(login, { userId: eva.id, password: "evita2026" });
  assert.equal(again.status, 200);
  assert.match(again.cookie ?? "", /pichuco_session=/);
  assert.equal((await call(setup, { userId: eva.id, teamCode: "pichuco", password: "otra123" })).status, 409);

  // El hash nunca viaja con el usuario
  assert.equal("passwordHash" in (await user("eva@pichuco.es")), false);
});

test("Martín restablece la contraseña; Eva no puede restablecer la de otros", async () => {
  const martin = await user("martin@pichuco.es");
  const eva = await user("eva@pichuco.es");
  await assert.rejects(resetPassword(eva, martin.id), /Martín/);
  await resetPassword(martin, eva.id);
  assert.equal(await db.session.count({ where: { userId: eva.id } }), 0);
  const r = await call(login, { userId: eva.id, password: "pichuco" }, "2.2.2.2");
  assert.deepEqual(r.body, { setup: true });
});
