import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createAnnouncement } from "@/lib/services/announcements";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  return createAnnouncement(user, await req.json());
});
