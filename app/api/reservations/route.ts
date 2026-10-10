import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createStaffReservation } from "@/lib/services/reservations";

export const POST = handle(async (req: Request) => {
  const { reservation, overCapacity } = await createStaffReservation(await requireUser(), await req.json());
  return { id: reservation.id, code: reservation.code, overCapacity };
});
