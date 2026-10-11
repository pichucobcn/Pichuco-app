/**
 * Carga el horario semanal real (`prisma/horarios.ts`).
 * - En el despliegue (`--si-falta`): sólo a quien todavía no tiene horario semanal;
 *   la primera vez también borra los turnos de prueba con fecha.
 * - A mano (`npm run db:horarios`): reemplaza el horario semanal de esas personas.
 */
import { PrismaClient } from "@prisma/client";
import { loadSchedule } from "./horarios";

const db = new PrismaClient();
const soloSiFalta = process.argv.includes("--si-falta");

(async () => {
  if (soloSiFalta && (await db.weeklyShift.count()) === 0) {
    // Primera vez: fuera los turnos de prueba con fecha.
    const { count } = await db.shift.deleteMany({});
    console.log(`Turnos de prueba borrados: ${count}.`);
  }
  const loaded = await loadSchedule(db, { onlyMissing: soloSiFalta });
  console.log(loaded.length ? `Horario semanal cargado: ${loaded.join(", ")}.` : "Horario semanal: nada nuevo que cargar.");
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
