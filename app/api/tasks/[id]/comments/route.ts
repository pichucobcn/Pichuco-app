import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { addComment } from "@/lib/services/tasks";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const { body } = z.object({ body: z.string() }).parse(await req.json());
  return addComment(user, id, body);
});
