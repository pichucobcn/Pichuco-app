import { handle } from "@/lib/api";
import { reservationSlots, takeawaySlots } from "@/lib/services/availability";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const date = u.searchParams.get("date") ?? "";
  const n = Math.max(1, Math.min(40, Number(u.searchParams.get("n") ?? 1) || 1));
  const r = u.searchParams.get("type") === "takeaway" ? await takeawaySlots(date, n) : await reservationSlots(date, n);
  return { closed: r.closed, slots: r.slots.filter((s) => s.available).map((s) => s.time) };
});
