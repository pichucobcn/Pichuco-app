import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getAttachment } from "@/lib/services/chat";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await getAttachment(await requireUser(), (await params).id);
  const inline = a.mime.startsWith("image/") || a.mime === "application/pdf";
  return new Response(Buffer.from(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
