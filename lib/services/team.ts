import type { Area, Role } from "@prisma/client";
import { db } from "../db";
import { fromDbDate, toDbDate } from "../dates";
import { ROLE_LABEL } from "../permissions";
import type { Actor } from "./context";

export async function listTeam() {
  return db.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Busca una persona por nombre, apodo o rol ("Gian", "Juan Pablo", "jefe de cocina", "Eva"). */
export async function findUserByName(name: string) {
  const q = normalize(name);
  if (!q) return null;
  const users = await listTeam();
  const byRole: Record<string, Role> = { "jefe de cocina": "JEFE_COCINA", jefe: "JEFE", cocinero: "COCINERO", camarera: "CAMARERA" };
  return (
    users.find((u) => normalize(u.shortName) === q || normalize(u.name) === q) ??
    users.find((u) => normalize(u.name).startsWith(q) || normalize(u.shortName).startsWith(q)) ??
    users.find((u) => normalize(u.name).split(" ").includes(q)) ??
    (byRole[q] ? users.find((u) => u.role === byRole[q]) : undefined) ??
    null
  );
}

/** Responsable de un área: cocina → jefe de cocina; el resto → jefe. */
export async function areaManagers(area: Area | null | undefined) {
  const users = await listTeam();
  const jefe = users.filter((u) => u.role === "JEFE");
  if (area === "COCINA") {
    const jc = users.filter((u) => u.role === "JEFE_COCINA");
    return jc.length ? jc : jefe;
  }
  return jefe;
}

export async function shiftsForDate(date: string) {
  return db.shift.findMany({ where: { date: toDbDate(date) }, include: { user: true }, orderBy: { start: "asc" } });
}

export async function shiftFor(userId: string, date: string) {
  return db.shift.findUnique({ where: { userId_date: { userId, date: toDbDate(date) } } });
}

/** Ficha pública del equipo para el día: nombre, rol, turno y estado de fichaje. */
export async function teamOverview(_actor: Actor, date: string) {
  const [users, shifts, lastClocks] = await Promise.all([
    listTeam(),
    shiftsForDate(date),
    db.clockEvent.findMany({
      where: { at: { gte: new Date(Date.now() - 18 * 3_600_000) } },
      orderBy: { at: "desc" },
    }),
  ]);
  return users.map((u) => {
    const shift = shifts.find((s) => s.userId === u.id);
    const last = lastClocks.find((c) => c.userId === u.id);
    const status =
      !last || last.type === "SALIDA" ? "fuera" : last.type === "PAUSA_INICIO" ? "en pausa" : "trabajando";
    return {
      id: u.id,
      name: u.name,
      shortName: u.shortName,
      role: u.role,
      roleLabel: ROLE_LABEL[u.role],
      area: u.area,
      avatarColor: u.avatarColor,
      shift: shift ? { start: shift.start, end: shift.end, date: fromDbDate(shift.date) } : null,
      status,
    };
  });
}
