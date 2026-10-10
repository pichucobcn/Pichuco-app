import { z } from "zod";
import { db } from "../db";
import { assertCan, ForbiddenError, NotFoundError, ValidationError } from "../permissions";
import type { Actor } from "./context";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel))$/;

async function membership(actor: Actor, conversationId: string) {
  assertCan(actor, "chat");
  const m = await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
  if (!m) throw new NotFoundError("Conversación no encontrada.");
  return m;
}

/** Nombre visible: el del grupo, o el de la otra persona en un 1 a 1. */
function displayName(c: { name: string | null; isGroup: boolean; members: { user: { id: string; shortName: string } }[] }, actorId: string) {
  if (c.name) return c.name;
  const others = c.members.filter((m) => m.user.id !== actorId).map((m) => m.user.shortName);
  return others.join(", ") || "Solo vos";
}

export async function listConversations(actor: Actor) {
  assertCan(actor, "chat");
  const convs = await db.conversation.findMany({
    where: { members: { some: { userId: actor.id } } },
    include: {
      members: { include: { user: { select: { id: true, shortName: true, name: true, avatarColor: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { shortName: true } }, attachment: { select: { name: true } } } },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  return Promise.all(
    convs.map(async (c) => {
      const me = c.members.find((m) => m.userId === actor.id)!;
      const unread = await db.chatMessage.count({
        where: { conversationId: c.id, createdAt: { gt: me.lastReadAt }, authorId: { not: actor.id } },
      });
      const last = c.messages[0];
      const other = !c.isGroup ? c.members.find((m) => m.userId !== actor.id)?.user : undefined;
      return {
        id: c.id,
        name: displayName(c, actor.id),
        isGroup: c.isGroup,
        avatar: other ? { name: other.name, color: other.avatarColor } : null,
        memberCount: c.members.length,
        unread,
        last: last
          ? { text: last.body || (last.attachment ? `Adjunto: ${last.attachment.name}` : ""), author: last.authorId === actor.id ? "Vos" : last.author.shortName, at: last.createdAt }
          : null,
      };
    }),
  );
}

export async function unreadChats(actor: Actor) {
  const list = await listConversations(actor).catch(() => []);
  return list.reduce((s, c) => s + c.unread, 0);
}

export async function getConversation(actor: Actor, id: string) {
  await membership(actor, id);
  const c = await db.conversation.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, shortName: true, name: true, avatarColor: true } } } } },
  });
  if (!c) throw new NotFoundError("Conversación no encontrada.");
  return { ...c, displayName: displayName(c, actor.id) };
}

export type ChatMessageView = {
  id: string;
  body: string;
  authorId: string;
  author: string;
  authorColor: string;
  at: string;
  replyTo: { id: string; author: string; body: string } | null;
  attachment: { id: string; name: string; mime: string; size: number } | null;
};

export async function listMessages(actor: Actor, conversationId: string, after?: string): Promise<ChatMessageView[]> {
  await membership(actor, conversationId);
  const msgs = await db.chatMessage.findMany({
    where: { conversationId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    include: {
      author: { select: { shortName: true, avatarColor: true } },
      replyTo: { include: { author: { select: { shortName: true } } } },
      attachment: { select: { id: true, name: true, mime: true, size: true } },
    },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: after ? 100 : 80,
  });
  if (!after) msgs.reverse();
  return msgs.map((m) => ({
    id: m.id,
    body: m.body,
    authorId: m.authorId,
    author: m.author.shortName,
    authorColor: m.author.avatarColor,
    at: m.createdAt.toISOString(),
    replyTo: m.replyTo ? { id: m.replyTo.id, author: m.replyTo.author.shortName, body: m.replyTo.body.slice(0, 120) } : null,
    attachment: m.attachment,
  }));
}

export const sendSchema = z.object({
  body: z.string().trim().max(4000).default(""),
  replyToId: z.string().optional().nullable(),
});

export async function sendMessage(
  actor: Actor,
  conversationId: string,
  raw: z.input<typeof sendSchema>,
  file?: { name: string; mime: string; data: Buffer },
) {
  await membership(actor, conversationId);
  const input = sendSchema.parse(raw);
  if (!input.body && !file) throw new ValidationError("El mensaje está vacío.");
  if (file) {
    if (file.data.length > MAX_ATTACHMENT_BYTES) throw new ValidationError("El archivo supera los 5 MB.");
    if (!ALLOWED_MIME.test(file.mime)) throw new ValidationError("Tipo de archivo no permitido (fotos, PDF, Word, Excel o texto).");
  }
  if (input.replyToId) {
    const r = await db.chatMessage.findUnique({ where: { id: input.replyToId } });
    if (!r || r.conversationId !== conversationId) throw new ValidationError("El mensaje al que respondés no existe.");
  }
  const now = new Date();
  const msg = await db.chatMessage.create({
    data: {
      conversationId,
      authorId: actor.id,
      body: input.body,
      replyToId: input.replyToId ?? null,
      createdAt: now,
      ...(file ? { attachment: { create: { name: file.name.slice(0, 200), mime: file.mime, size: file.data.length, data: new Uint8Array(file.data) } } } : {}),
    },
  });
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: actor.id } }, data: { lastReadAt: now } }),
  ]);
  return msg;
}

export async function markConversationRead(actor: Actor, conversationId: string) {
  await membership(actor, conversationId);
  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: actor.id } },
    data: { lastReadAt: new Date() },
  });
}

export const newConversationSchema = z.object({
  memberIds: z.array(z.string()).min(1).max(30),
  name: z.string().trim().max(60).optional().nullable(),
});

/** Crea un chat. Un 1 a 1 que ya existe se reutiliza. */
export async function createConversation(actor: Actor, raw: z.input<typeof newConversationSchema>) {
  assertCan(actor, "chat");
  const input = newConversationSchema.parse(raw);
  const ids = [...new Set(input.memberIds.filter((id) => id !== actor.id))];
  if (!ids.length) throw new ValidationError("Elegí al menos una persona.");
  const users = await db.user.findMany({ where: { id: { in: ids }, active: true } });
  if (users.length !== ids.length) throw new ValidationError("Alguna persona no existe.");
  const isGroup = ids.length > 1 || !!input.name;
  if (!isGroup) {
    const existing = await db.conversation.findFirst({
      where: { isGroup: false, AND: [{ members: { some: { userId: actor.id } } }, { members: { some: { userId: ids[0] } } }] },
    });
    if (existing) return existing;
  }
  return db.conversation.create({
    data: {
      isGroup,
      name: isGroup ? input.name || users.map((u) => u.shortName).concat(actor.shortName).join(", ") : null,
      members: { create: [actor.id, ...ids].map((userId) => ({ userId })) },
    },
  });
}

export async function getAttachment(actor: Actor, id: string) {
  const a = await db.chatAttachment.findUnique({ where: { id }, include: { message: true } });
  if (!a) throw new NotFoundError("Archivo no encontrado.");
  await membership(actor, a.message.conversationId).catch(() => {
    throw new ForbiddenError("No tenés acceso a este archivo.");
  });
  return a;
}
