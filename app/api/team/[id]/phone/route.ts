import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updatePhone } from "@/lib/services/team";

export const PUT = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { phone } = z.object({ phone: z.string().max(30).nullable() }).parse(await req.json());
  const u = await updatePhone(await requireUser(), (await params).id, phone);
  return { phone: u.phone };
});
