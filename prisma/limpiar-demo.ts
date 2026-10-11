/**
 * Borra los datos de prueba y deja la app lista para usar de verdad.
 *
 * Se borra: tareas, comunicados, avisos, conversaciones con Pichuco, chats,
 * pedidos, movimientos de stock (el stock vuelve a 0), agenda, retrasos y
 * ausencias, fichajes, registros sanitarios (temperaturas, limpieza,
 * elaboraciones, recepciones, incidencias, plagas, formación), platos de
 * prueba, equipos de frío dados de baja e historial de acciones.
 *
 * Se conserva: las personas (con sus contraseñas, teléfonos y horarios),
 * proveedores y productos, neveras y congeladores, reglas de compra, plan de
 * limpieza y tipos de elaboración.
 *
 * `npm run db:limpiar-demo` (pide --si confirmar) o, en el despliegue,
 * `--una-vez`: sólo si nunca se hizo.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const FLAG = "datos-de-prueba-borrados";
const once = process.argv.includes("--una-vez");
const confirmed = process.argv.includes("--si") || once;

async function main() {
  if (once && (await db.appFlag.findUnique({ where: { key: FLAG } }))) {
    console.log("Datos de prueba ya borrados antes: no se toca nada.");
    return;
  }
  if (!confirmed) {
    console.log("Esto borra los datos de prueba. Para hacerlo: npm run db:limpiar-demo -- --si");
    return;
  }
  const r = await db.$transaction([
    db.nonConformity.deleteMany(),
    db.temperatureLog.deleteMany(),
    db.receptionCheck.deleteMany(),
    db.cleaningLog.deleteMany(),
    db.elaboration.deleteMany(),
    db.dish.deleteMany(),
    db.pestControlVisit.deleteMany(),
    db.trainingCert.deleteMany(),
    db.foodEquipment.deleteMany({ where: { active: false } }),
    db.conversation.deleteMany(),
    db.agendaEvent.deleteMany(),
    db.stockMovement.deleteMany(),
    db.purchaseOrder.deleteMany(),
    db.product.updateMany({ data: { stock: 0 } }),
    db.auditLog.deleteMany(),
    db.aiMessage.deleteMany(),
    db.notification.deleteMany(),
    db.incident.deleteMany(),
    db.announcementRead.deleteMany(),
    db.announcement.deleteMany(),
    db.taskComment.deleteMany(),
    db.task.deleteMany(),
    db.clockEvent.deleteMany(),
    db.shift.deleteMany(),
    db.otpCode.deleteMany(),
    db.appFlag.upsert({ where: { key: FLAG }, create: { key: FLAG }, update: { at: new Date() } }),
  ]);
  await db.$executeRawUnsafe(`ALTER SEQUENCE "PurchaseOrder_number_seq" RESTART WITH 1`);
  const n = (i: number) => (r[i] as { count: number }).count;
  console.log(
    `Datos de prueba borrados: ${n(21)} tareas, ${n(19)} comunicados, ${n(12)} pedidos, ${n(9)} chats, ${n(1)} temperaturas, ${n(4)} elaboraciones, ${n(5)} platos, ${n(22)} fichajes.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
