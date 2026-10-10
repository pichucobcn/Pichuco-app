import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { markConversationRead } from "@/lib/services/chat";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await markConversationRead(await requireUser(), (await params).id);
  return { ok: true };
});
