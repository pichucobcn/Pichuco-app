import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { saveSupplier } from "@/lib/services/suppliers";

export const POST = handle(async (req: Request) => saveSupplier(await requireUser(), null, await req.json()));
