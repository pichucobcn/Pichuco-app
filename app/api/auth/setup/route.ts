import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, MIN_PASSWORD, teamCode, teamCodeOk } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { sessionResponse } from "../session";

/** Primera vez: con el código del equipo, la persona elige su contraseña y entra. */
export const POST = handle(async (req: Request) => {
  const input = z
    .object({ userId: z.string().min(1), teamCode: z.string().min(1).max(200), password: z.string().max(200) })
    .parse(await req.json());
  if (!rateLimit(`login:${clientIp(req)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }
  const user = await db.user.findUnique({ where: { id: input.userId }, omit: { passwordHash: false } });
  if (!user || !user.active || user.passwordHash) return NextResponse.json({ error: "Ya tenés contraseña: entrá con ella." }, { status: 409 });
  if (!teamCode()) return NextResponse.json({ error: "Falta configurar el código del equipo (PICHUCO_ACCESS_CODE) en Vercel." }, { status: 503 });
  if (!teamCodeOk(input.teamCode)) return NextResponse.json({ error: "Ese no es el código del equipo." }, { status: 401 });
  if (input.password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.` }, { status: 400 });
  }
  if (teamCodeOk(input.password)) return NextResponse.json({ error: "Elegí una contraseña distinta del código del equipo." }, { status: 400 });
  await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(input.password), passwordSetAt: new Date() } });
  return sessionResponse(user.id);
});
