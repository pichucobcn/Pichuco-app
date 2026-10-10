import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { saveSupplier } from "@/lib/services/suppliers";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  saveSupplier(await requireUser(), (await params).id, await req.json()),
);
