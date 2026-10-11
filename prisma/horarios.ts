/**
 * Horario semanal real del equipo. Cada día: [inicio, fin]; si el fin es
 * anterior al inicio, el turno termina pasada la medianoche.
 *
 * `loadSchedule` reemplaza el horario semanal de estas personas. Un turno con
 * fecha concreta (tabla Shift) tiene prioridad sobre el horario semanal.
 */
import type { PrismaClient } from "@prisma/client";

const DOM = 0, LUN = 1, MIE = 3, JUE = 4, VIE = 5, SAB = 6;

export const HORARIOS: Record<string, [number, string, string][]> = {
  Martín: [
    [LUN, "19:00", "00:00"],
    [MIE, "19:00", "00:00"],
    [JUE, "19:00", "00:00"],
    [VIE, "19:00", "01:00"],
    [SAB, "19:00", "01:00"],
    [DOM, "19:00", "01:00"],
  ],
  Eva: [
    [VIE, "19:00", "01:00"],
    [SAB, "19:00", "01:00"],
    [DOM, "19:00", "01:00"],
  ],
  Gian: [
    [MIE, "16:00", "00:00"],
    [JUE, "16:00", "00:00"],
    [VIE, "17:00", "00:00"],
    [SAB, "17:00", "00:00"],
  ],
  "Juan Pablo": [
    [DOM, "16:00", "00:00"],
    [LUN, "16:00", "00:00"],
    [VIE, "17:00", "00:00"],
    [SAB, "17:00", "00:00"],
  ],
};

/** Carga el horario de cada persona. Con `onlyMissing`, sólo a quien todavía no tiene. Devuelve a quién se cargó. */
export async function loadSchedule(db: PrismaClient, { onlyMissing = false } = {}) {
  const loaded: string[] = [];
  for (const [shortName, days] of Object.entries(HORARIOS)) {
    const user = await db.user.findFirst({ where: { shortName } });
    if (!user) continue;
    if (onlyMissing && (await db.weeklyShift.count({ where: { userId: user.id } })) > 0) continue;
    loaded.push(shortName);
    await db.weeklyShift.deleteMany({ where: { userId: user.id } });
    await db.weeklyShift.createMany({ data: days.map(([weekday, start, end]) => ({ userId: user.id, weekday, start, end })) });
  }
  return loaded;
}
