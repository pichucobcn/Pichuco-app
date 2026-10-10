import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { db } from "./db";

export const SESSION_COOKIE = "pichuco_session";
const SESSION_DAYS = 30;
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class AuthError extends Error {
  status = 401;
}

/** Genera un código de 6 dígitos para el email. Devuelve el código sólo para enviarlo. */
export async function createOtp(email: string): Promise<{ user: User; code: string } | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.otpCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await db.otpCode.create({
    data: { userId: user.id, codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000) },
  });
  return { user, code };
}

export async function verifyOtp(email: string, code: string): Promise<User | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) return null;
  const otp = await db.otpCode.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return null;
  const ok = timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(sha256(code.trim())));
  if (!ok) {
    await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return null;
  }
  await db.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return user;
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

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

/** Para páginas: redirige a /login si no hay sesión. */
export async function requireUserPage(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para rutas API: lanza 401 si no hay sesión. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Tenés que iniciar sesión.");
  return user;
}
