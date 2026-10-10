import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { clock } from "@/lib/services/clock";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { type, note } = z
    .object({ type: z.enum(["ENTRADA", "SALIDA", "PAUSA_INICIO", "PAUSA_FIN"]), note: z.string().max(300).optional() })
    .parse(await req.json());
  return clock(user, type, note);
});
