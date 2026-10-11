/**
 * Neveras y congeladores reales (registro de temperaturas APPCC).
 * B = barra / sala, C = cocina. Rangos por defecto: neveras 0 a 4 °C,
 * congeladores −25 a −18 °C (se pueden ajustar en Sanidad → Temperaturas).
 *
 * `loadEquipment` es idempotente: si todavía no están cargados, desactiva los
 * equipos de prueba (sus registros se conservan) y crea estos.
 */
import type { PrismaClient } from "@prisma/client";

type Equipo = { code: string; kind: "REFRIGERACION" | "CONGELACION" };

export const EQUIPOS: Equipo[] = [
  { code: "B1", kind: "REFRIGERACION" },
  { code: "B2", kind: "REFRIGERACION" },
  { code: "B3", kind: "CONGELACION" },
  { code: "C1", kind: "REFRIGERACION" },
  { code: "C2", kind: "REFRIGERACION" },
  { code: "C3", kind: "REFRIGERACION" },
  { code: "C4", kind: "REFRIGERACION" },
  { code: "C5", kind: "REFRIGERACION" },
  { code: "C6", kind: "REFRIGERACION" },
  { code: "C7", kind: "CONGELACION" },
];

export const equipoName = (e: Equipo) => `${e.kind === "CONGELACION" ? "Congelador" : "Nevera"} ${e.code}`;

export async function loadEquipment(db: PrismaClient) {
  const ids: Record<string, string> = {};
  const already = await db.foodEquipment.findFirst({ where: { name: equipoName(EQUIPOS[0]) } });
  if (!already) await db.foodEquipment.updateMany({ where: { active: true }, data: { active: false } });
  for (const [i, e] of EQUIPOS.entries()) {
    const name = equipoName(e);
    const found = await db.foodEquipment.findFirst({ where: { name } });
    const [minTemp, maxTemp] = e.kind === "CONGELACION" ? [-25, -18] : [0, 4];
    ids[e.code] =
      found?.id ??
      (await db.foodEquipment.create({ data: { name, kind: e.kind, minTemp, maxTemp, sort: i + 1, area: e.code.startsWith("B") ? "SALA" : "COCINA" } })).id;
  }
  return ids;
}
