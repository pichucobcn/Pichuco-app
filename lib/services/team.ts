import type { Area, Role } from "@prisma/client";
import { db } from "../db";
import { fromDbDate, toDbDate } from "../dates";
import { can, ForbiddenError, ROLE_LABEL, ValidationError } from "../permissions";
import { isValidPhone, normalizePhone } from "../phone";
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

const weekdayOf = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();

/** Turnos del día: el horario semanal de cada uno, salvo que haya un turno con fecha que lo reemplace. */
export async function shiftsForDate(date: string) {
  const [dated, weekly] = await Promise.all([
    db.shift.findMany({ where: { date: toDbDate(date) }, include: { user: true } }),
    db.weeklyShift.findMany({ where: { weekday: weekdayOf(date), user: { active: true } }, include: { user: true } }),
  ]);
  const overridden = new Set(dated.map((s) => s.userId));
  const fromWeek = weekly
    .filter((w) => !overridden.has(w.userId))
    .map((w) => ({ id: w.id, userId: w.userId, date: toDbDate(date), start: w.start, end: w.end, note: null as string | null, user: w.user }));
  return [...dated, ...fromWeek].sort((a, b) => a.start.localeCompare(b.start) || a.user.shortName.localeCompare(b.user.shortName));
}

export async function shiftFor(userId: string, date: string) {
  const dated = await db.shift.findUnique({ where: { userId_date: { userId, date: toDbDate(date) } } });
  if (dated) return dated;
  const w = await db.weeklyShift.findUnique({ where: { userId_weekday: { userId, weekday: weekdayOf(date) } } });
  return w ? { id: w.id, userId, date: toDbDate(date), start: w.start, end: w.end, note: null as string | null } : null;
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
      phone: u.phone,
      shift: shift ? { start: shift.start, end: shift.end, date: fromDbDate(shift.date) } : null,
      status,
    };
  });
}

/** Teléfono de contacto: cada uno el suyo; quien gestiona personal, el de cualquiera. */
export async function updatePhone(actor: Actor, userId: string, phone: string | null) {
  if (userId !== actor.id && !can(actor, "personal")) throw new ForbiddenError("Sólo podés cambiar tu propio teléfono.");
  const value = phone?.trim() ? normalizePhone(phone) : null;
  if (value && !isValidPhone(value)) throw new ValidationError("Teléfono no válido.");
  return db.user.update({ where: { id: userId }, data: { phone: value } });
}
