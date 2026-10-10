import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { setReservationStatus } from "@/lib/services/reservations";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { status } = z.object({ status: z.enum(["CONFIRMADA", "SENTADA", "NO_SHOW", "CANCELADA"]) }).parse(await req.json());
  return setReservationStatus(await requireUser(), (await params).id, status);
});
