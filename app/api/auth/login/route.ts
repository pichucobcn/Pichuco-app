import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, teamCode, teamCodeOk } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { sessionResponse } from "../session";

/**
 * Entrar con nombre + contraseña. Si la persona todavía no eligió contraseña,
 * la "contraseña" es el código del equipo y la respuesta pide elegir una (setup).
 */
export const POST = handle(async (req: Request) => {
  const { userId, password } = z.object({ userId: z.string().min(1), password: z.string().min(1).max(200) }).parse(await req.json());
  if (!rateLimit(`login:${clientIp(req)}`, 20, 10 * 60_000) || !rateLimit(`login-user:${userId}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }
  const user = await db.user.findUnique({ where: { id: userId }, omit: { passwordHash: false } });
  if (!user || !user.active) return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });

  if (!user.passwordHash) {
    if (!teamCode()) return NextResponse.json({ error: "Falta configurar el código del equipo (PICHUCO_ACCESS_CODE) en Vercel." }, { status: 503 });
    if (!teamCodeOk(password)) return NextResponse.json({ error: "Ese no es el código del equipo." }, { status: 401 });
    return { setup: true };
  }
  if (!checkPassword(password, user.passwordHash)) return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  return sessionResponse(user.id);
});
