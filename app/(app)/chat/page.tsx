import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { listNotifications, markAllRead } from "@/lib/services/notifications";
import { dateOf, relativeDay, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";

export default async function ChatPage() {
  const user = await requireUserPage();
  const items = await listNotifications(user, 40);
  // Al abrir la bandeja se dan por vistos.
  await markAllRead(user);
  return (
    <main>
      <PageTitle title="Chat" />
      <div className="grid-2">
        <Link href="/pichuco" className="card" style={{ background: "var(--burgundy)", color: "var(--cream)" }}>
          <b style={{ fontFamily: "var(--font-poster)", fontWeight: 400 }}>PICHUCO AI</b>
          <div className="small">Asistente operativo: tareas, retrasos, agenda.</div>
        </Link>
        <div className="card">
          <b style={{ fontFamily: "var(--font-poster)", fontWeight: 400 }}>CHAT DEL EQUIPO</b>
          <div className="small muted">Conversaciones 1 a 1 y grupos, fotos y archivos. Llega en la Fase 2.</div>
        </div>
      </div>
      <div className="filete">
        <h2>Avisos para vos</h2>
      </div>
      <div className="stack">
        {items.length === 0 && <p className="empty">No tenés avisos. Pichuco sólo te avisa de lo que te toca.</p>}
        {items.map((n) => {
          const inner = (
            <>
              <div className="row small muted">
                <span>
                  {relativeDay(dateOf(n.createdAt))} {timeOf(n.createdAt)}
                </span>
                <span className="spacer" />
                {!n.readAt && <span className="tag solid-red">Nuevo</span>}
              </div>
              <b>🔔 {n.title}</b>
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
    </main>
  );
}
