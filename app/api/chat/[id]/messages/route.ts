import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { ValidationError } from "@/lib/permissions";
import { listMessages, markConversationRead, MAX_ATTACHMENT_BYTES, sendMessage } from "@/lib/services/chat";

type Ctx = { params: Promise<{ id: string }> };

/** Mensajes nuevos desde `after` (ISO). El cliente consulta cada pocos segundos. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  const messages = await listMessages(user, id, after);
  if (messages.length) await markConversationRead(user, id);
  return { messages };
});

/** Enviar: multipart con `body`, `replyToId` y opcionalmente `file`. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  let attachment: { name: string; mime: string; data: Buffer } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new ValidationError("El archivo supera los 5 MB.");
    attachment = { name: file.name, mime: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()) };
  }
  const msg = await sendMessage(
    user,
    id,
    { body: String(form.get("body") ?? ""), replyToId: (form.get("replyToId") as string) || null },
    attachment,
  );
  return { id: msg.id };
});
