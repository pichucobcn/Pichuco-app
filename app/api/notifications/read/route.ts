import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { markAllRead } from "@/lib/services/notifications";

export const POST = handle(async () => {
  await markAllRead(await requireUser());
  return { ok: true };
});
