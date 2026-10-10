import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { setTakeawayStatus } from "@/lib/services/takeaway";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { status } = z.object({ status: z.enum(["NUEVO", "CONFIRMADO", "EN_PREPARACION", "LISTO", "RETIRADO", "CANCELADO"]) }).parse(await req.json());
  const o = await setTakeawayStatus(await requireUser(), (await params).id, status);
  return { id: o.id, status: o.status };
});
