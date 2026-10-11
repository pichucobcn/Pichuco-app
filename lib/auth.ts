import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppUser } from "./services/context";
import { db } from "./db";

export const SESSION_COOKIE = "pichuco_session";
const SESSION_DAYS = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class AuthError extends Error {
  status = 401;
}

// ── Contraseñas ──────────────────────────────────────────
export const MIN_PASSWORD = 6;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function checkPassword(password: string, stored: string | null | undefined): boolean {
  const [kind, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(password, salt, 32);
  const b = Buffer.from(hash, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Código del equipo: la contraseña de la primera vez, que reparte Martín
 * (PICHUCO_ACCESS_CODE). En desarrollo, si no está configurado, es "pichuco".
 */
export function teamCode(): string | null {
  return process.env.PICHUCO_ACCESS_CODE?.trim() || (process.env.NODE_ENV !== "production" ? "pichuco" : null);
}

export function teamCodeOk(given: string): boolean {
  const expected = teamCode();
  if (!expected) return false;
  const a = Buffer.from(given.trim().toUpperCase());
  const b = Buffer.from(expected.toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

/** Para páginas: redirige a /login si no hay sesión. */
export async function requireUserPage(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para rutas API: lanza 401 si no hay sesión. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Tenés que iniciar sesión.");
  return user;
}
