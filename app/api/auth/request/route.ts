import { z } from "zod";
import { createOtp } from "@/lib/auth";
import { handle } from "@/lib/api";

export const POST = handle(async (req: Request) => {
  const { email } = z.object({ email: z.string().email() }).parse(await req.json());
  const otp = await createOtp(email);
  if (otp) {
    // TODO(producción): enviar el código por email (Resend, SES…). En modo demo se muestra en pantalla.
    console.log(`[Pichuco] Código de acceso para ${otp.user.email}: ${otp.code}`);
  }
  // Misma respuesta exista o no el email, para no revelar quién trabaja en Pichuco.
  return { ok: true, demoCode: process.env.PICHUCO_DEMO_OTP === "1" ? otp?.code : undefined };
});
