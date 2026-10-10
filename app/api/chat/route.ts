import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createConversation } from "@/lib/services/chat";

export const POST = handle(async (req: Request) => {
  const c = await createConversation(await requireUser(), await req.json());
  return { id: c.id };
});
