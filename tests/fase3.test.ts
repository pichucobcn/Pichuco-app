import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { addDays, todayISO } from "../lib/dates";
import { localAgent } from "../lib/ai/local";
import { createPublicReservation, cancelReservationByCode } from "../lib/services/reservations";
import { createPublicTakeaway, markTakeawayPaid, setTakeawayStatus, cancelTakeawayByCode, getMenu } from "../lib/services/takeaway";
import { reservationSlots, takeawaySlots } from "../lib/services/availability";
import { getSchedule } from "../lib/services/agenda";
import { demandForecast } from "../lib/services/demand";
import { listCustomers, normalizePhone, anonymizeCustomer } from "../lib/services/customers";

before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());

const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });
const today = todayISO();
/** Próximo día abierto (no lunes) a partir de pasado mañana, para no depender de la hora actual. */
function openDay(offset = 2) {
  let d = addDays(today, offset);
  while (new Date(d + "T00:00:00Z").getUTCDay() === 1) d = addDays(d, 1);
  return d;
}
function nextMonday() {
  let d = addDays(today, 1);
  while (new Date(d + "T00:00:00Z").getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}
const contact = { name: "Lucía Test", phone: "699 123 456", email: "", privacy: true };

test("teléfonos españoles se normalizan", () => {
  assert.equal(normalizePhone("699 12 34 56"), "+34699123456");
  assert.equal(normalizePhone("0034 699123456"), "+34699123456");
});

test("reserva pública: se confirma, exige privacidad, respeta cierre y cupo", async () => {
  const d = openDay();
  const r = await createPublicReservation({ ...contact, date: d, time: "21:00", people: 4 });
  assert.equal(r.status, "CONFIRMADA");
  assert.match(r.code, /^[A-Z2-9]{6}$/);
  await assert.rejects(createPublicReservation({ ...contact, privacy: false, date: d, time: "21:00", people: 2 }), /privacidad/);
  await assert.rejects(createPublicReservation({ ...contact, date: nextMonday(), time: "21:00", people: 2 }), /cerrado/);
  await assert.rejects(createPublicReservation({ ...contact, date: d, time: "21:00", people: 12 }), /llamanos/);
  // Llenar la franja de las 22:00 (cupo 24) y comprobar que ya no aparece
  for (let i = 0; i < 3; i++) await createPublicReservation({ ...contact, phone: `69900000${i}`, date: d, time: "22:00", people: 8 });
  const { slots } = await reservationSlots(d, 2);
  assert.equal(slots.find((s) => s.time === "22:00")?.available, false);
  await assert.rejects(createPublicReservation({ ...contact, date: d, time: "22:00", people: 2 }), /disponible/);
  // El cliente puede cancelarla con su código
  await cancelReservationByCode(r.code);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).status, "CANCELADA");
});

test("pedido para llevar: precios calculados en el servidor, extras y cupo del horno", async () => {
  const d = openDay();
  const { items, extras } = await getMenu();
  const muzza = items.find((i) => i.name === "Muzza")!;
  const faina = items.find((i) => i.name === "Fainá")!;
  const extra = extras.find((e) => e.name === "Extra muzza")!;
  const o = await createPublicTakeaway({
    ...contact,
    date: d,
    time: "20:00",
    paymentMethod: "AL_RECOGER",
    items: [
      { menuItemId: muzza.id, quantity: 2, extraIds: [extra.id] },
      { menuItemId: faina.id, quantity: 1, extraIds: [] },
    ],
  });
  assert.equal(o.total, 2 * (12.5 + 2) + 3);
  await assert.rejects(
    createPublicTakeaway({ ...contact, date: d, time: "20:00", paymentMethod: "AL_RECOGER", items: [{ menuItemId: faina.id, quantity: 1, extraIds: [extra.id] }] }),
    /sólo para pizzas/,
  );
  // Cupo: 8 pizzas por franja; ya hay 2 → 7 más no entran
  await assert.rejects(
    createPublicTakeaway({ ...contact, date: d, time: "20:00", paymentMethod: "AL_RECOGER", items: [{ menuItemId: muzza.id, quantity: 7, extraIds: [] }] }),
    /completo/,
  );
  const { slots } = await takeawaySlots(d, 6);
  assert.equal(slots.find((s) => s.time === "20:00")?.available, true);
  // Gian recibe el aviso del pedido (pago al retirar)
  const gian = await user("gian@pichuco.es");
  assert.ok(await db.notification.findFirst({ where: { userId: gian.id, title: `Pedido para llevar #${o.number}` } }));
});

test("pago online: se avisa a cocina sólo cuando se confirma el pago", async () => {
  const d = openDay(3);
  const { items } = await getMenu();
  const o = await createPublicTakeaway({ ...contact, date: d, time: "21:00", paymentMethod: "ONLINE", items: [{ menuItemId: items[0].id, quantity: 1, extraIds: [] }] });
  const gian = await user("gian@pichuco.es");
  assert.equal(await db.notification.count({ where: { userId: gian.id, title: `Pedido para llevar #${o.number}` } }), 0);
  const paid = await markTakeawayPaid(o.code, "demo");
  assert.equal(paid.paymentStatus, "PAGADO");
  assert.equal(paid.status, "CONFIRMADO");
  assert.equal(await db.notification.count({ where: { userId: gian.id, title: `Pedido para llevar #${o.number}` } }), 1);
  await markTakeawayPaid(o.code, "demo"); // idempotente
  assert.equal(await db.notification.count({ where: { userId: gian.id, title: `Pedido para llevar #${o.number}` } }), 1);
  await assert.rejects(cancelTakeawayByCode(o.code), /pagado/);
});

test("tablero: cocina prepara, sólo sala/Martín entrega; Eva no ve el tablero", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const martin = await user("martin@pichuco.es");
  const eva = await user("eva@pichuco.es");
  await setTakeawayStatus(jp, 422, "EN_PREPARACION");
  await setTakeawayStatus(jp, 422, "LISTO");
  await assert.rejects(setTakeawayStatus(jp, 422, "RETIRADO"), /sala o Martín/);
  const done = await setTakeawayStatus(martin, 422, "RETIRADO");
  assert.equal(done.paymentStatus, "PAGADO"); // pagó al retirar
  await assert.rejects(setTakeawayStatus(eva, 421, "LISTO"), /acceso/);
  const r = await localAgent(jp, "El 421 está listo");
  assert.match(r.text, /#421: listo/);
});

test("agenda: reservas y pedidos reales, sin datos de contacto", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const s = await getSchedule(jp, today);
  assert.equal(s.reservations.length, 4);
  assert.ok(s.takeaway.some((t) => t.title === "Pedido #421"));
  assert.doesNotMatch(JSON.stringify(s.reservations), /\+346/);
});

test("demanda prevista de mañana supera la media y recomienda masa", async () => {
  const f = await demandForecast(addDays(today, 1));
  assert.equal(f.level, "alta");
  assert.ok(f.doughNeededKg > 0);
  assert.match(f.message, /superior a la habitual/);
  const gian = await user("gian@pichuco.es");
  const r = await localAgent(gian, "¿Cuánta masa hace falta mañana?");
  assert.match(r.text, /pizzas/);
});

test("reserva por teléfono hablando con Pichuco", async () => {
  const eva = await user("eva@pichuco.es");
  const d = openDay();
  const r = await localAgent(eva, `Reservá mesa para 5 el ${d.slice(8)}/${d.slice(5, 7)} a las 21 a nombre de Gómez, 611 222 333`);
  assert.match(r.text, /Reserva cargada: 5 personas a nombre de Gómez/);
  const jp = await user("juanpablo@pichuco.es");
  const no = await localAgent(jp, `Reservá mesa para 2 el ${d.slice(8)}/${d.slice(5, 7)} a las 21 a nombre de Pérez, 611 222 444`);
  assert.match(no.text, /No pude/);
});

test("clientes: sólo Martín ve la ficha; supresión de datos", async () => {
  const eva = await user("eva@pichuco.es");
  const martin = await user("martin@pichuco.es");
  await assert.rejects(listCustomers(eva), /permiso/);
  const list = await listCustomers(martin, "Soler");
  assert.equal(list.length, 1);
  await anonymizeCustomer(martin, list[0].id);
  const c = await db.customer.findUniqueOrThrow({ where: { id: list[0].id } });
  assert.equal(c.name, "Cliente eliminado");
  assert.equal(c.email, null);
  assert.ok(await db.reservation.count({ where: { customerId: c.id } }) > 0); // historial conservado
});
