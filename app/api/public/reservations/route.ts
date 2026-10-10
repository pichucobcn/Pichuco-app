import { handle } from "@/lib/api";
import { guardPublic } from "@/lib/public-api";
import { createPublicReservation } from "@/lib/services/reservations";

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const blocked = guardPublic(req, body, "reserva");
  if (blocked) return blocked;
  const r = await createPublicReservation(body ?? {});
  return { code: r.code };
});
