import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { markAnnouncementRead } from "@/lib/services/announcements";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await markAnnouncementRead(user, id);
  return { ok: true };
});
