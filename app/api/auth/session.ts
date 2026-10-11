import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

/** Abre la sesión y la deja en la cookie. */
export async function sessionResponse(userId: string, body: object = { ok: true }) {
  const { token, expiresAt } = await createSession(userId);
  const res = NextResponse.json(body);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
