import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { NotFoundError } from "@/lib/permissions";
import { approveOrder, cancelOrder, confirmOrder, markSent, receiveOrder, rejectOrder } from "@/lib/services/purchases";

/** Acciones sobre un pedido: approve, reject, send, confirm, receive, cancel. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string; action: string }> }) => {
  const user = await requireUser();
  const { id, action } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = z.object({ reason: z.string().max(300).optional() }).parse(body).reason;
  switch (action) {
    case "approve":
      await approveOrder(user, id);
      break;
    case "reject":
      await rejectOrder(user, id, reason);
      break;
    case "send":
      await markSent(user, id, z.object({ via: z.enum(["WHATSAPP", "EMAIL", "TELEFONO", "OTRO"]) }).parse(body).via);
      break;
    case "confirm":
      await confirmOrder(user, id, body);
      break;
    case "receive":
      await receiveOrder(user, id, body);
      break;
    case "cancel":
      await cancelOrder(user, id, reason);
      break;
    default:
      throw new NotFoundError("Acción desconocida.");
  }
  return { ok: true };
});
