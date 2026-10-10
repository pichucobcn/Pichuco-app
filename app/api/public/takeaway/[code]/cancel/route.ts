import { handle } from "@/lib/api";
import { guardPublic } from "@/lib/public-api";
import { cancelTakeawayByCode } from "@/lib/services/takeaway";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ code: string }> }) => {
  const blocked = guardPublic(req, null, "cancelar", 10);
  if (blocked) return blocked;
  await cancelTakeawayByCode((await params).code);
  return { ok: true };
});
