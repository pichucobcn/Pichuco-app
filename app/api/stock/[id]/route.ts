import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { adjustStock } from "@/lib/services/stock";

/** Ajuste de stock: { stock } (recuento) o { delta } (consumo/merma). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  adjustStock(await requireUser(), (await params).id, await req.json()),
);
