/**
 * Datos de prueba de Pichuco. Las fechas son relativas a hoy, así la demo
 * siempre tiene algo que mostrar. Ejecutar con `npm run db:seed`.
 */
import { PrismaClient, type Area, type Role } from "@prisma/client";
import { addDays, toDbDate, todayISO } from "../lib/dates";

const db = new PrismaClient();

const USERS: { email: string; name: string; shortName: string; role: Role; area: Area; avatarColor: string }[] = [
  { email: "martin@pichuco.es", name: "Martín Grossman", shortName: "Martín", role: "JEFE", area: "ADMIN", avatarColor: "#862820" },
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

  const u: Record<string, string> = {};
  for (const data of USERS) u[data.shortName] = (await db.user.create({ data })).id;

  for (let i = -7; i <= 14; i++) {
    const date = addDays(today, i);
    if (new Date(date + "T00:00:00Z").getUTCDay() === 1) continue;
    for (const [name, [start, end]] of Object.entries(SHIFTS)) {
      await db.shift.create({ data: { userId: u[name], date: toDbDate(date), start, end } });
    }
  }

  const ev = (kind: "ENTREGA" | "RESERVA" | "TAKEAWAY", date: string, time: string, title: string, extra: object = {}) =>
    db.agendaEvent.create({ data: { kind, date: toDbDate(date), time, title, ...extra } });

  // Hoy
  await ev("ENTREGA", today, "18:15", "Bebidas", { responsibleId: u.Eva, detail: "Distribuidora de bebidas" });
  await ev("RESERVA", today, "20:00", "García", { people: 4 });
  await ev("RESERVA", today, "20:30", "Puig", { people: 2 });
  await ev("RESERVA", today, "21:00", "Cumpleaños Laura", { people: 8, detail: "Traen torta" });
  await ev("RESERVA", today, "21:30", "Fernández", { people: 3 });
  await ev("TAKEAWAY", today, "19:30", "Pedido #421", { detail: "2 × Muzza, 1 × Fugazzeta, 1 × Fainá" });
  await ev("TAKEAWAY", today, "21:15", "Pedido #422", { detail: "1 × Napolitana, 2 × Empanadas de carne" });

  // Mañana (la escena de la especificación)
  await ev("ENTREGA", tomorrow, "18:15", "Harina", { responsibleId: u["Juan Pablo"], detail: "Molino — 4 sacos de 25 kg" });
  await ev("ENTREGA", tomorrow, "19:00", "Bebidas", { responsibleId: u.Eva });
  await ev("RESERVA", tomorrow, "20:00", "Martínez", { people: 4 });
  await ev("RESERVA", tomorrow, "21:00", "Soler", { people: 6 });
  await ev("TAKEAWAY", tomorrow, "20:45", "Pedido #430", { detail: "3 × Muzza, 1 × Calabresa" });

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

  console.log(`Seed listo (${today}). Usuarios: ${USERS.map((x) => x.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
