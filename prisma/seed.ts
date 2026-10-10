/**
 * Datos de prueba de Pichuco. Las fechas son relativas a hoy, así la demo
 * siempre tiene algo que mostrar. Ejecutar con `npm run db:seed`.
 */
import { PrismaClient, type Area, type Role } from "@prisma/client";
import { addDays, toDbDate, todayISO } from "../lib/dates";

const db = new PrismaClient();

const USERS: { email: string; name: string; shortName: string; role: Role; area: Area; avatarColor: string }[] = [
  { email: "martin@pichuco.es", name: "Martín Grossman", shortName: "Martín", role: "JEFE", area: "ADMIN", avatarColor: "#351a17" },
  { email: "gian@pichuco.es", name: "Gian Marcuzzi", shortName: "Gian", role: "JEFE_COCINA", area: "COCINA", avatarColor: "#5b6b2f" },
  { email: "juanpablo@pichuco.es", name: "Juan Pablo Buono", shortName: "Juan Pablo", role: "COCINERO", area: "COCINA", avatarColor: "#b5651d" },
  { email: "eva@pichuco.es", name: "Eva Fort", shortName: "Eva", role: "CAMARERA", area: "SALA", avatarColor: "#2f5d6b" },
];

// Turnos de la semana (cerrado los lunes).
const SHIFTS: Record<string, [string, string]> = {
  Gian: ["17:30", "00:00"],
  "Juan Pablo": ["18:00", "00:00"],
  Eva: ["19:00", "00:30"],
  Martín: ["19:30", "00:30"],
};

async function main() {
  const today = todayISO();
  const tomorrow = addDays(today, 1);

  await db.$transaction([
    db.conversation.deleteMany(),
    db.stockMovement.deleteMany(),
    db.purchaseOrder.deleteMany(),
    db.product.deleteMany(),
    db.supplier.deleteMany(),
    db.purchasePolicy.deleteMany(),
    db.auditLog.deleteMany(),
    db.aiMessage.deleteMany(),
    db.notification.deleteMany(),
    db.agendaEvent.deleteMany(),
    db.incident.deleteMany(),
    db.announcementRead.deleteMany(),
    db.announcement.deleteMany(),
    db.taskComment.deleteMany(),
    db.task.deleteMany(),
    db.clockEvent.deleteMany(),
    db.shift.deleteMany(),
    db.otpCode.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
  ]);

  // Numeraciones desde el principio en cada siembra
  await db.$executeRawUnsafe(`ALTER SEQUENCE "PurchaseOrder_number_seq" RESTART WITH 1`);

  const u: Record<string, string> = {};
  for (const data of USERS) u[data.shortName] = (await db.user.create({ data })).id;

  for (let i = -7; i <= 14; i++) {
    const date = addDays(today, i);
    if (new Date(date + "T00:00:00Z").getUTCDay() === 1) continue;
    for (const [name, [start, end]] of Object.entries(SHIFTS)) {
      await db.shift.create({ data: { userId: u[name], date: toDbDate(date), start, end } });
    }
  }

  const ev = (kind: "ENTREGA", date: string, time: string, title: string, extra: object = {}) =>
    db.agendaEvent.create({ data: { kind, date: toDbDate(date), time, title, ...extra } });

  // Hoy
  await ev("ENTREGA", today, "18:15", "Bebidas", { responsibleId: u.Eva, detail: "Distribuidora de bebidas" });

  // Mañana (la escena de la especificación)
  await ev("ENTREGA", tomorrow, "19:00", "Bebidas", { responsibleId: u.Eva });

  const task = (data: Parameters<typeof db.task.create>[0]["data"]) => db.task.create({ data });
  await task({ title: "8 kg de masa", kind: "PRODUCCION", area: "COCINA", quantity: 8, unit: "kg", date: toDbDate(today), dueTime: "18:30", priority: "ALTA", createdById: u.Gian });
  await task({ title: "Salsa de tomate", kind: "PRODUCCION", area: "COCINA", assigneeId: u["Juan Pablo"], quantity: 5, unit: "l", date: toDbDate(today), dueTime: "19:00", createdById: u.Gian, status: "EN_CURSO" });
  await task({ title: "Repasar cartas y menús del día", kind: "GENERAL", area: "SALA", assigneeId: u.Eva, date: toDbDate(today), dueTime: "19:30", createdById: u.Martín });
  await task({ title: "Limpiar campana extractora", kind: "LIMPIEZA", area: "COCINA", date: toDbDate(tomorrow), priority: "MEDIA", createdById: u.Gian });
  await task({ title: "8 kg de masa", kind: "PRODUCCION", area: "COCINA", quantity: 8, unit: "kg", date: toDbDate(tomorrow), dueTime: "18:30", createdById: u.Gian });
  await task({ title: "Revisar facturas de la semana", kind: "ADMINISTRATIVA", area: "ADMIN", assigneeId: u.Martín, date: toDbDate(addDays(today, 2)), createdById: u.Martín });

  const a = await db.announcement.create({
    data: {
      title: "Mañana llegan las bebidas a las 19:00",
      body: "Mañana el proveedor de bebidas llega a las 19:00.\nEva queda responsable de recibirlo.",
      level: "IMPORTANTE",
      authorId: u.Martín,
    },
  });
  await db.announcementRead.createMany({ data: [{ announcementId: a.id, userId: u.Martín }, { announcementId: a.id, userId: u.Gian }] });

  // ── Fase 2: proveedores, stock y compras
  await db.purchasePolicy.create({ data: { id: "default", autoLimit: 100, managerLimit: 300, alwaysApprove: ["Equipamiento"] } });

  const sup = async (data: Parameters<typeof db.supplier.create>[0]["data"]) => (await db.supplier.create({ data })).id;
  const S = {
    lacteos: await sup({ name: "Lácteos del Montseny", contactName: "Jordi", phone: "+34 600 111 222", whatsapp: "+34 600 111 222", email: "pedidos@lacteosmontseny.example", hours: "L–S 7:00–13:00", deliveryDays: [2, 4, 6], deliveryTime: "10:00", minOrder: 60, conditions: "Pago a 30 días.", channel: "WHATSAPP" }),
    molino: await sup({ name: "Molí Fariner", contactName: "Montse", phone: "+34 600 333 444", whatsapp: "+34 600 333 444", email: "comandes@molifariner.example", hours: "L–V 8:00–15:00", deliveryDays: [0, 3, 5], deliveryTime: "18:15", minOrder: 80, conditions: "Sacos de 25 kg. Pago al contado.", channel: "WHATSAPP" }),
    bebidas: await sup({ name: "Distribuciones Begudes BCN", contactName: "Raúl", phone: "+34 600 555 666", email: "pedidos@begudesbcn.example", hours: "L–V 9:00–18:00", deliveryDays: [1, 3, 6], deliveryTime: "19:00", minOrder: 150, conditions: "Devolución de envases vacíos.", channel: "EMAIL" }),
    verdu: await sup({ name: "Verdures del Mercat", contactName: "Anna", phone: "+34 600 777 888", whatsapp: "+34 600 777 888", hours: "L–S 6:00–12:00", deliveryDays: [1, 2, 3, 4, 5, 6], deliveryTime: "11:00", conditions: "Precio según mercado.", channel: "WHATSAPP" }),
    carnes: await sup({ name: "Carns Sants", contactName: "Pere", phone: "+34 600 999 000", whatsapp: "+34 600 999 000", email: "carns@carnssants.example", hours: "L–S 7:00–14:00", deliveryDays: [2, 5], deliveryTime: "12:00", minOrder: 50, channel: "WHATSAPP" }),
  };
  const prod = async (name: string, category: string, unit: string, stock: number, minStock: number, supplierId: string, price: number) =>
    (await db.product.create({ data: { name, category, unit, stock, minStock, supplierId, usualPrice: price, lastPrice: price } })).id;
  const P = {
    mozza: await prod("Mozzarella", "Lácteos", "kg", 4, 10, S.lacteos, 7.8),
    provo: await prod("Provolone", "Lácteos", "kg", 3, 2, S.lacteos, 12.5),
    crema: await prod("Crema de leche", "Lácteos", "l", 6, 4, S.lacteos, 3.2),
    harina: await prod("Harina 00", "Secos", "kg", 30, 50, S.molino, 0.95),
    semola: await prod("Sémola", "Secos", "kg", 12, 5, S.molino, 1.4),
    cerveza: await prod("Cerveza Quilmes (caja 24)", "Bebidas", "cajas", 3, 4, S.bebidas, 28),
    agua: await prod("Agua mineral (caja 12)", "Bebidas", "cajas", 8, 4, S.bebidas, 6.5),
    vino: await prod("Malbec (caja 6)", "Bebidas", "cajas", 5, 3, S.bebidas, 45),
    tomate: await prod("Tomate triturado", "Verdura", "kg", 18, 10, S.verdu, 1.9),
    cebolla: await prod("Cebolla", "Verdura", "kg", 9, 8, S.verdu, 1.2),
    peceto: await prod("Peceto (milanesas)", "Carne", "kg", 2, 5, S.carnes, 14.9),
    jamon: await prod("Jamón cocido", "Carne", "kg", 4, 2, S.carnes, 11.5),
  };

  // Pedido entregado la semana pasada (historial)
  const lastWeek = addDays(today, -6);
  await db.purchaseOrder.create({
    data: {
      supplierId: S.lacteos, status: "ENTREGADO", total: 78, approvalNote: "Aprobado automáticamente (no supera €100,00).",
      deliveryDate: toDbDate(lastWeek), deliveryTime: "10:00", createdById: u.Gian, approvedAt: new Date(Date.now() - 7 * 864e5),
      sentAt: new Date(Date.now() - 7 * 864e5), sentVia: "WHATSAPP", confirmedAt: new Date(Date.now() - 7 * 864e5), deliveredAt: new Date(Date.now() - 6 * 864e5),
      lines: { create: [{ productId: P.mozza, quantity: 10, unitPrice: 7.8 }] },
      events: { create: [
        { userId: u.Gian, text: "Preparó el pedido (€78,00). Aprobado automáticamente (no supera €100,00)." },
        { userId: u.Gian, text: "Envió el pedido al proveedor (whatsapp)." },
        { userId: u.Gian, text: "Recibió el pedido y lo sumó al stock." },
      ] },
    },
  });
  // Harina confirmada para mañana 18:15: la recibe Juan Pablo (aparece en Agenda)
  const harina = await db.purchaseOrder.create({
    data: {
      supplierId: S.molino, status: "CONFIRMADO", total: 95, approvalNote: "Aprobado automáticamente (no supera €100,00).",
      deliveryDate: toDbDate(tomorrow), deliveryTime: "18:15", createdById: u.Gian, approvedAt: new Date(), sentAt: new Date(), sentVia: "WHATSAPP", confirmedAt: new Date(),
      lines: { create: [{ productId: P.harina, quantity: 100, unitPrice: 0.95 }] },
      events: { create: [
        { userId: u.Gian, text: "Preparó el pedido (€95,00). Aprobado automáticamente (no supera €100,00)." },
        { userId: u.Gian, text: "Envió el pedido al proveedor (whatsapp)." },
        { userId: u.Gian, text: "Proveedor confirmó. Entrega mañana 18:15." },
      ] },
    },
  });
  await ev("ENTREGA", tomorrow, "18:15", "Harina", { responsibleId: u["Juan Pablo"], detail: "Molí Fariner — pedido #" + harina.number + ": 4 sacos de 25 kg", purchaseOrderId: harina.id });
  // Bebidas pendiente de aprobación de Martín
  await db.purchaseOrder.create({
    data: {
      supplierId: S.bebidas, status: "PENDIENTE_APROBACION", total: 211, approvalNote: "Entre €100,00 y €300,00: requiere aprobación del jefe.",
      deliveryDate: toDbDate(addDays(today, 3)), deliveryTime: "19:00", createdById: u.Gian,
      lines: { create: [{ productId: P.cerveza, quantity: 5, unitPrice: 28 }, { productId: P.agua, quantity: 4, unitPrice: 6.5 }, { productId: P.vino, quantity: 1, unitPrice: 45 }] },
      events: { create: [{ userId: u.Gian, text: "Preparó el pedido (€211,00). Entre €100,00 y €300,00: requiere aprobación del jefe." }] },
    },
  });
  await db.notification.create({ data: { userId: u.Martín, title: "Compra para aprobar", body: "Gian pide cerveza, agua y vino a Distribuciones Begudes BCN — €211,00.", link: "/compras" } });

  // ── Fase 2: chat del equipo
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const conv = async (name: string | null, members: string[], msgs: [string, string, number][]) => {
    const c = await db.conversation.create({
      data: { name, isGroup: !!name, lastMessageAt: minsAgo(msgs.at(-1)?.[2] ?? 0), members: {
          create: members.map((userId) => {
            // Cada uno leyó la conversación hasta su último mensaje.
            const own = msgs.filter(([a]) => u[a] === userId).map(([, , ago]) => ago);
            return { userId, lastReadAt: minsAgo(own.length ? Math.min(...own) : 500) };
          }),
        } },
    });
    for (const [author, body, ago] of msgs) await db.chatMessage.create({ data: { conversationId: c.id, authorId: u[author], body, createdAt: minsAgo(ago) } });
    return c;
  };
  await conv("Cocina", [u.Martín, u.Gian, u["Juan Pablo"]], [
    ["Gian", "Hoy hacemos doble tanda de masa, hay cumple a las 21.", 180],
    ["Juan Pablo", "Dale, llego 17:50 y arranco.", 170],
    ["Martín", "Genial. Ojo que mañana llega la harina 18:15.", 95],
  ]);
  await conv("Todo el equipo", [u.Martín, u.Gian, u["Juan Pablo"], u.Eva], [
    ["Martín", "Equipo: el lunes cerrado por inventario, ¡a descansar!", 300],
    ["Eva", "¡Gracias Martín!", 290],
  ]);
  await conv(null, [u.Martín, u.Eva], [
    ["Eva", "Martín, la mesa del cumple de las 21 pide si pueden traer torta propia.", 60],
    ["Martín", "Sí, sin problema. Cobramos servicio de torta de 2€ por persona.", 55],
    ["Eva", "Perfecto, les aviso.", 20],
  ]);

  console.log(`Seed listo (${today}). Usuarios: ${USERS.map((x) => x.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
