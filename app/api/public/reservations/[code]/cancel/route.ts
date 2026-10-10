import { handle } from "@/lib/api";
import { guardPublic } from "@/lib/public-api";
import { cancelReservationByCode } from "@/lib/services/reservations";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ code: string }> }) => {
  const blocked = guardPublic(req, null, "cancelar", 10);
  if (blocked) return blocked;
  await cancelReservationByCode((await params).code);
  return { ok: true };
});
