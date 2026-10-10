import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "./ratelimit";

/** Protecciones de los formularios públicos: límite por IP y campo trampa para bots. */
export function guardPublic(req: Request, body: Record<string, unknown> | null, bucket: string, max = 8): NextResponse | null {
  if (!rateLimit(`${bucket}:${clientIp(req)}`, max, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Probá de nuevo en unos minutos." }, { status: 429 });
  }
  // "website" está oculto en el formulario: sólo lo rellenan los bots.
  if (body && typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ error: "No se pudo procesar." }, { status: 400 });
  }
  return null;
}

export function baseUrl(req: Request) {
  return process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}
