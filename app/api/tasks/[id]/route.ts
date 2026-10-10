import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updateTask } from "@/lib/services/tasks";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  return updateTask(user, id, await req.json());
});
