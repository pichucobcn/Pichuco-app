import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Envuelve un handler de API y traduce errores de dominio a respuestas HTTP. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const result = await fn(...args);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Datos inválidos", issues: err.issues }, { status: 400 });
      }
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        return NextResponse.json({ error: (err as Error).message }, { status });
      }
      console.error(err);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  };
}
