import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, SESSION_COOKIE, verifyOtp } from "@/lib/auth";
import { handle } from "@/lib/api";

export const POST = handle(async (req: Request) => {
  const { email, code } = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
  const user = await verifyOtp(email, code);
  if (!user) return NextResponse.json({ error: "Código incorrecto o vencido." }, { status: 401 });
  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
});
