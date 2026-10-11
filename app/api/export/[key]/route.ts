import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { exportCsv } from "@/lib/services/exportar";

/** Descarga un CSV. Sin `from`/`to`, todo el histórico. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const { body, name } = await exportCsv(user, (await params).key, u.searchParams.get("from"), u.searchParams.get("to"));
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
});
