/**
 * Carga el horario semanal real (`prisma/horarios.ts`).
 * - En el despliegue (`--si-falta`): sólo si todavía no hay horario semanal;
 *   en ese caso también borra los turnos de prueba con fecha.
 * - A mano (`npm run db:horarios`): reemplaza el horario semanal de esas personas.
 */
import { PrismaClient } from "@prisma/client";
import { loadSchedule } from "./horarios";

const db = new PrismaClient();
const soloSiFalta = process.argv.includes("--si-falta");

(async () => {
  if (soloSiFalta && (await db.weeklyShift.count()) > 0) {
    console.log("Horario semanal ya cargado: no se toca.");
    return;
  }
  if (soloSiFalta) {
    const { count } = await db.shift.deleteMany({});
    console.log(`Turnos de prueba borrados: ${count}.`);
  }
  await loadSchedule(db);
  console.log("Horario semanal cargado.");
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
