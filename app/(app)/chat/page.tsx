import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { listConversations } from "@/lib/services/chat";
import { listNotifications, markAllRead } from "@/lib/services/notifications";
import { listTeam } from "@/lib/services/team";
import { dateOf, relativeDay, timeOf, todayISO } from "@/lib/dates";
import { Avatar } from "@/components/Avatar";
import { PageTitle } from "@/components/PageTitle";
import { NewChat } from "./NewChat";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUserPage();
  const tab = (await searchParams).tab === "avisos" ? "avisos" : "chats";
  const [convs, notes, team] = await Promise.all([listConversations(user), listNotifications(user, 40), listTeam()]);
  const unreadNotes = notes.filter((n) => !n.readAt).length;
  if (tab === "avisos") await markAllRead(user);
  const today = todayISO();

  return (
    <main>
      <PageTitle title="Chat" />
      <nav className="tabs">
        <Link href="/chat" className={tab === "chats" ? "active" : ""}>
          Conversaciones
        </Link>
        <Link href="/chat?tab=avisos" className={tab === "avisos" ? "active" : ""}>
          Avisos{unreadNotes ? ` · ${unreadNotes}` : ""}
        </Link>
      </nav>

      {tab === "chats" ? (
        <>
          <Link href="/pichuco" className="card row ai-link">
            <img src="/brand/pichuco-cara.png" alt="" className="ai-face lg" />
            <div style={{ flex: 1 }}>
              <b className="display-sm">Pichuco AI</b>
              <div className="small muted">Asistente operativo: tareas, retrasos, compras, agenda.</div>
            </div>
          </Link>
          <div className="filete">
            <h2>Equipo</h2>
          </div>
          <NewChat team={team.filter((u) => u.id !== user.id).map((u) => ({ id: u.id, name: u.shortName }))} />
          <div className="card chat-list" style={{ marginTop: 10 }}>
            {convs.length === 0 && <p className="empty">Todavía no hay conversaciones.</p>}
            {convs.map((c) => (
              <Link key={c.id} href={`/chat/${c.id}`} className="chat-row">
                {c.avatar ? (
                  <Avatar name={c.avatar.name} color={c.avatar.color} size={44} />
                ) : (
                  <span className="avatar group" style={{ width: 44, height: 44 }} aria-hidden="true">
                    {c.memberCount}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</b>
                    {c.last && (
                      <span className="small muted">{dateOf(c.last.at) === today ? timeOf(c.last.at) : relativeDay(dateOf(c.last.at))}</span>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="small muted chat-preview">{c.last ? `${c.last.author}: ${c.last.text}` : "Sin mensajes"}</span>
                    {c.unread > 0 && <span className="pill">{c.unread}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="stack">
          {notes.length === 0 && <p className="empty">No tenés avisos. Pichuco sólo te avisa de lo que te toca.</p>}
          {notes.map((n) => {
            const inner = (
              <>
                <div className="row small muted">
                  <span>
                    {relativeDay(dateOf(n.createdAt))} {timeOf(n.createdAt)}
                  </span>
                  <span className="spacer" />
                  {!n.readAt && <span className="tag solid-red">Nuevo</span>}
                </div>
                <b>{n.title}</b>
                <div style={{ whiteSpace: "pre-line" }}>{n.body}</div>
              </>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="card">
                {inner}
              </Link>
            ) : (
              <div key={n.id} className="card">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
