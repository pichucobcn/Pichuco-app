import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updatePolicy } from "@/lib/services/purchases";

export const PUT = handle(async (req: Request) => {
  await updatePolicy(await requireUser(), await req.json());
  return { ok: true };
});
