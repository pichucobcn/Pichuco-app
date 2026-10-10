import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { assertCan } from "@/lib/permissions";
import { askPichuco } from "@/lib/ai/agent";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  assertCan(user, "ai");
  const { message } = z.object({ message: z.string().trim().min(1).max(2000) }).parse(await req.json());
  return askPichuco(user, message);
});
