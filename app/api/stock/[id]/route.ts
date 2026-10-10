import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { adjustStock, updateProduct } from "@/lib/services/stock";

type Ctx = { params: Promise<{ id: string }> };

/** Ajuste de stock: { stock } (recuento) o { delta } (consumo/merma). */
export const POST = handle(async (req: Request, { params }: Ctx) => adjustStock(await requireUser(), (await params).id, await req.json()));

/** Editar la ficha del producto. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => updateProduct(await requireUser(), (await params).id, await req.json()));
