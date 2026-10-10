import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createProduct } from "@/lib/services/stock";

export const POST = handle(async (req: Request) => createProduct(await requireUser(), await req.json()));
