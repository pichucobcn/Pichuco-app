import { db } from "../db";
import type { Actor } from "./context";

/** Notifica sólo a quien corresponde. Nunca a toda la plantilla por defecto. */
export async function notify(userIds: string[], title: string, body: string, link?: string) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await db.notification.createMany({ data: unique.map((userId) => ({ userId, title, body, link })) });
}

export async function listNotifications(actor: Actor, limit = 30) {
  return db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function unreadCount(actor: Actor) {
  return db.notification.count({ where: { userId: actor.id, readAt: null } });
}

export async function markAllRead(actor: Actor) {
  await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}
