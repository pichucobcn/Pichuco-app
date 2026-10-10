import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { getConversation, listMessages, markConversationRead } from "@/lib/services/chat";
import { PageTitle } from "@/components/PageTitle";
import { Conversation } from "./Conversation";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;
  const conv = await getConversation(user, id).catch(() => null);
  if (!conv) notFound();
  const messages = await listMessages(user, id);
  await markConversationRead(user, id);
  return (
    <main className="chat-main">
      <PageTitle title={conv.displayName} back="/chat" />
      {conv.isGroup && (
        <p className="small muted" style={{ margin: "-8px 0 10px" }}>
          {conv.members.map((m) => m.user.shortName).join(", ")}
        </p>
      )}
      <Conversation id={id} me={user.id} initial={messages} isGroup={conv.isGroup} />
    </main>
  );
}
