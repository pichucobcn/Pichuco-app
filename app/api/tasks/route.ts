import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createTask } from "@/lib/services/tasks";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  return createTask(user, await req.json());
});
