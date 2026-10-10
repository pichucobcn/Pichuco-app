import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtp } from "@/lib/auth";
import { handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** Compara el código de acceso del equipo sin filtrar información por tiempos. */
function accessCodeOk(given: string | undefined) {
  const expected = process.env.PICHUCO_ACCESS_CODE;
  if (!expected) return true;
  const a = Buffer.from((given ?? "").trim().toUpperCase());
  const b = Buffer.from(expected.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = handle(async (req: Request) => {
  if (!rateLimit(`otp:${clientIp(req)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Probá en unos minutos." }, { status: 429 });
  }
  const { email, accessCode } = z.object({ email: z.string().email(), accessCode: z.string().max(60).optional() }).parse(await req.json());
  if (!accessCodeOk(accessCode)) {
    return NextResponse.json({ error: "Código del equipo incorrecto." }, { status: 401 });
  }
  const otp = await createOtp(email);
  if (otp) {
    // TODO(producción): enviar el código por email (Resend, SES…). En modo demo se muestra en pantalla.
    console.log(`[Pichuco] Código de acceso para ${otp.user.email}: ${otp.code}`);
  }
  // Misma respuesta exista o no el email, para no revelar quién trabaja en Pichuco.
  return { ok: true, demoCode: process.env.PICHUCO_DEMO_OTP === "1" ? otp?.code : undefined };
});
