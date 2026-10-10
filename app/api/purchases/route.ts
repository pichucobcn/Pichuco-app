import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createOrder } from "@/lib/services/purchases";

export const POST = handle(async (req: Request) => {
  const { order } = await createOrder(await requireUser(), await req.json());
  return { id: order.id, number: order.number, status: order.status };
});
