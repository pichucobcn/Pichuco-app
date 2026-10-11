import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, hashPassword, MIN_PASSWORD, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";

/** Cambiar la propia contraseña (pide la actual). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { current, password } = z.object({ current: z.string().max(200), password: z.string().max(200) }).parse(await req.json());
  const stored = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!checkPassword(current, stored?.passwordHash)) return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 401 });
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `La contraseña nueva tiene que tener al menos ${MIN_PASSWORD} caracteres.` }, { status: 400 });
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password), passwordSetAt: new Date() } });
  return { ok: true };
});
