import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { db } from "../lib/db";
import { localAgent } from "../lib/ai/local";
import { executeTool } from "../lib/ai/tools";
import { approveOrder, createOrder, decideApproval, markSent, receiveOrder, confirmOrder, getOrder, supplierMessage, setCallBefore } from "../lib/services/purchases";
import { updatePhone } from "../lib/services/team";
import { createConversation, listMessages, sendMessage, getAttachment } from "../lib/services/chat";
import { adjustStock, listProducts } from "../lib/services/stock";

before(() => execSync("npx tsx prisma/seed.ts", { stdio: "ignore" }));
after(() => db.$disconnect());

const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

test("reglas de aprobación: automático, jefe y obligatoria", async () => {
  const gian = await user("gian@pichuco.es");
  assert.equal((await decideApproval(gian, 80, ["Lácteos"])).level, "AUTO");
  assert.equal((await decideApproval(gian, 150, ["Lácteos"])).level, "JEFE");
  assert.equal((await decideApproval(gian, 350, ["Lácteos"])).level, "OBLIGATORIA");
  assert.equal((await decideApproval(gian, 20, ["Equipamiento"])).level, "JEFE"); // categoría sensible
});

test("límite por persona: Gian con 200 € compra 150 € sin aprobación", async () => {
  await db.user.update({ where: { email: "gian@pichuco.es" }, data: { purchaseAutoLimit: 200 } });
  const gian = await user("gian@pichuco.es");
  assert.equal((await decideApproval(gian, 150, ["Lácteos"])).level, "AUTO");
  await db.user.update({ where: { email: "gian@pichuco.es" }, data: { purchaseAutoLimit: null } });
});

test("Pichuco AI prepara el pedido de muzzarella al proveedor habitual; sin precio lo aprueba Martín", async () => {
  const gian = await user("gian@pichuco.es");
  const r = await localAgent(gian, "Comprá 15 kilos de mozzarella");
  assert.match(r.text, /Lácteos da Limia/);
  assert.match(r.text, /15 kg de muzzarella rallada/);
  assert.match(r.text, /sin precio/);
  assert.match(r.text, /Martín/);
  const o = await db.purchaseOrder.findFirstOrThrow({ where: { createdById: gian.id, createdByAi: true }, orderBy: { number: "desc" } });
  assert.equal(o.status, "PENDIENTE_APROBACION");
  const martin = await user("martin@pichuco.es");
  assert.ok(await db.notification.findFirst({ where: { userId: martin.id, title: "Compra para aprobar", link: `/compras/${o.number}` } }));
  // Martín lo aprueba hablando con Pichuco
  const a = await localAgent(martin, `Aprobá el pedido ${o.number}`);
  assert.match(a.text, /Aprobado/);
});

test("si se nombra el proveedor, busca el producto entre los suyos; si hay dudas, pregunta", async () => {
  const martin = await user("martin@pichuco.es");
  const r = await localAgent(martin, "necesitamos 20 kilos de queso merkapizza para el viernes");
  assert.match(r.text, /pedido #\d+ a Merkapizza/);
  assert.match(r.text, /20 kg de queso napoli rallado/);
  const r2 = await localAgent(martin, "Comprá 5 kg de queso");
  assert.match(r2.text, /Queso azul \(Ken Foods\), Queso napoli rallado \(Merkapizza\)/);
  const r3 = await localAgent(martin, "Pedile 3 latas de salsa de tomate a Merkapizza");
  assert.match(r3.text, /a Merkapizza/);
  assert.match(r3.text, /salsa de tomate premium/);
});

test("con precio cargado, un pedido chico se aprueba solo", async () => {
  const gian = await user("gian@pichuco.es");
  const p = await db.product.findFirstOrThrow({ where: { name: "Muzzarella rallada" } });
  await db.product.update({ where: { id: p.id }, data: { usualPrice: 7.5, lastPrice: 7.5 } });
  const r = await localAgent(gian, "Comprá 10 kilos de muzzarella");
  assert.match(r.text, /€75,00/);
  assert.match(r.text, /aprobado automáticamente/);
});

test("un cocinero no puede pedir: Pichuco se lo pasa a Gian", async () => {
  const jp = await user("juanpablo@pichuco.es");
  const r = await localAgent(jp, "Comprá 5 kg de cebolla");
  assert.match(r.text, /Gian/);
  assert.equal(await db.purchaseOrder.count({ where: { createdById: jp.id } }), 0);
  await assert.rejects(createOrder(jp, { lines: [{ productName: "cebolla", quantity: 5 }] }), /permiso/);
});

test("Pichuco AI no puede aprobar compras por encima del límite del jefe", async () => {
  const gian = await user("gian@pichuco.es");
  const martin = await user("martin@pichuco.es");
  const { order } = await createOrder(gian, { lines: [{ productName: "Provolone", quantity: 30, unitPrice: 12 }] }); // 360 €
  assert.equal(order.status, "PENDIENTE_APROBACION");
  const viaAi = await executeTool(martin, "approve_purchase_order", { order_number: order.number }, { viaAi: true });
  assert.equal(viaAi.isError, true);
  assert.match(viaAi.content, /pantalla del pedido/);
  const ok = await approveOrder(martin, order.number); // desde la app sí
  assert.equal(ok.status, "APROBADO");
});

test("ciclo completo: enviar, confirmar (Agenda) y recibir suma al stock", async () => {
  const gian = await user("gian@pichuco.es");
  const before = (await listProducts(gian)).find((p) => p.name === "Bacon ahumado")!;
  const { order, approved } = await createOrder(gian, { lines: [{ productName: "bacon", quantity: 5, unitPrice: 9 }] }); // 45 €
  assert.equal(approved, true);
  await markSent(gian, order.number, "WHATSAPP");
  await assert.rejects(confirmOrder(gian, order.number, { deliveryDate: "2026-10-13", deliveryTime: "12:00", deliveryTimeTo: "11:00" }), /posterior/);
  await confirmOrder(gian, order.number, { deliveryDate: "2026-10-13", deliveryTime: "10:00", deliveryTimeTo: "12:00" });
  const ev = await db.agendaEvent.findUniqueOrThrow({ where: { purchaseOrderId: order.id } });
  assert.equal(ev.time, "10:00");
  assert.equal(ev.endTime, "12:00");
  const full = await getOrder(gian, order.number);
  assert.match(supplierMessage(full), /Entrega: martes 13\/10 entre las 10:00 y las 12:00\./);
  await receiveOrder(gian, order.number, { received: { [order.lines[0].id]: 4 } });
  const after = await db.product.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(after.stock, before.stock + 4);
  assert.ok(await db.stockMovement.findFirst({ where: { productId: before.id, reason: "ENTRADA_PEDIDO", delta: 4 } }));
  assert.equal(after.lastPrice, 9);
});

test("stock: Eva no puede ver ni tocar el stock", async () => {
  const eva = await user("eva@pichuco.es");
  await assert.rejects(listProducts(eva), /permiso/);
  const p = await db.product.findFirstOrThrow();
  await assert.rejects(adjustStock(eva, p.id, { delta: -1 }), /permiso/);
});

test("¿qué falta comprar? avisa lo que está bajo el mínimo", async () => {
  const gian = await user("gian@pichuco.es");
  const harina = await db.product.findFirstOrThrow({ where: { name: "Harina" } });
  await db.product.update({ where: { id: harina.id }, data: { stock: 20, minStock: 50 } });
  const r = await localAgent(gian, "¿Qué falta comprar?");
  assert.match(r.text, /Harina: 20 kg/);
  assert.match(r.text, /Cusiné/);
});

test("catálogo real cargado y recarga sin duplicar", async () => {
  const { loadCatalog, CATALOG } = await import("../prisma/catalogo");
  const total = CATALOG.reduce((s, c) => s + c.products.length, 0);
  assert.equal(await db.product.count(), total);
  await loadCatalog(db);
  assert.equal(await db.product.count(), total);
  assert.equal(await db.supplier.count(), CATALOG.length);
});

test("chat: sólo los miembros leen la conversación y sus adjuntos", async () => {
  const martin = await user("martin@pichuco.es");
  const eva = await user("eva@pichuco.es");
  const jp = await user("juanpablo@pichuco.es");
  const c = await createConversation(martin, { memberIds: [eva.id] });
  const again = await createConversation(eva, { memberIds: [martin.id] });
  assert.equal(again.id, c.id); // el 1 a 1 se reutiliza
  const msg = await sendMessage(martin, c.id, { body: "Foto de la reserva" }, { name: "r.png", mime: "image/png", data: Buffer.from([137, 80, 78, 71]) });
  const list = await listMessages(eva, c.id);
  assert.ok(list.some((m) => m.id === msg.id && m.attachment));
  await assert.rejects(listMessages(jp, c.id), /no encontrada/);
  const att = list.find((m) => m.id === msg.id)!.attachment!;
  await assert.rejects(getAttachment(jp, att.id), /acceso/);
  await assert.rejects(sendMessage(martin, c.id, { body: "" }, { name: "x.html", mime: "text/html", data: Buffer.from("<b>") }), /no permitido/);
});

test("llamar antes a: por defecto quien pide; elegible sólo jefe y cocina; sale en el mensaje", async () => {
  const gian = await user("gian@pichuco.es");
  const eva = await user("eva@pichuco.es");
  const jp = await user("juanpablo@pichuco.es");
  await updatePhone(gian, gian.id, "600 11 22 33");
  await assert.rejects(updatePhone(gian, jp.id, "600000000"), /propio/);
  const { order } = await createOrder(gian, { lines: [{ productName: "Brie", quantity: 2 }], deliveryTime: "10:00", deliveryTimeTo: "12:00" });
  assert.equal(order.callBefore?.shortName, "Gian");
  assert.match(supplierMessage(order), /Llamar antes a Gian \(600 11 22 33\)\./);
  await assert.rejects(createOrder(gian, { lines: [{ productName: "Brie", quantity: 1 }], callBeforeId: eva.id }), /contacto/);
  const changed = await setCallBefore(gian, order.number, jp.id);
  assert.match(supplierMessage(changed), /Llamar antes a Juan Pablo\./);
  const r = await localAgent(gian, "Comprá 2 kg de mascarpone, que llamen antes a Juan Pablo");
  assert.match(r.text, /Llamar antes a: Juan Pablo/);
  assert.match(r.text, /mascarpone/);
});
