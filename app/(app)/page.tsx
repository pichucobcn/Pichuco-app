import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { aiMode } from "@/lib/ai/agent";
import { greeting } from "@/lib/services/agenda";
import { unreadAnnouncements } from "@/lib/services/announcements";
import { listTasks } from "@/lib/services/tasks";
import { currentJourney } from "@/lib/services/clock";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/dates";
import { Icon } from "@/components/Icon";
import { PichucoChat } from "@/components/PichucoChat";

export default async function Home() {
  const user = await requireUserPage();
  const [g, unread, openToday, journey] = await Promise.all([
    greeting(user),
    unreadAnnouncements(user),
    listTasks(user, { date: todayISO(), status: "ABIERTAS", mine: !can(user, "tareas_todas") }),
    currentJourney(user),
  ]);
  const mode = aiMode();
  const clockLabel = journey.state === "fuera" ? "Entrada / Salida" : journey.state === "en pausa" ? "En pausa" : "Trabajando";

  const modules = [
    { href: "/fichar", icon: "clock", title: "Fichar", sub: clockLabel, sub2: "Pausas", badge: 0 },
    { href: "/compras", icon: "cart", title: "Compras", sub: "Pedidos y proveedores", badge: 0 },
    { href: "/tareas", icon: "tasks", title: "Tareas", sub: "Producción y pendientes", badge: openToday.length },
    { href: "/comunicados", icon: "megaphone", title: "Comunicados", sub: "Avisos del equipo", badge: unread },
    { href: "/chat", icon: "chat", title: "Chat", sub: "Mensajes del equipo", badge: 0 },
  ];

  return (
    <main>
      <section className="ai-hero" aria-labelledby="ai-title">
        <div className="head">
          <h2 id="ai-title">Pichuco AI</h2>
          <span className={`status-dot ${mode === "demo" ? "demo" : ""}`}>{mode === "claude" ? "En línea" : "En línea · demo"}</span>
          <span className="spacer" />
          <Link href="/pichuco" className="link">
            Historial
          </Link>
        </div>
        <div className="body">
          <img src="/brand/pichuco.png" alt="Pichuco con su bandoneón" className="mascot" />
          <div className="bubble">{g.text}</div>
        </div>
        <PichucoChat initial={[]} compact />
      </section>

      <nav className="modules" aria-label="Accesos principales">
        {modules.map((m) => (
          <Link key={m.href} href={m.href} className="module">
            {m.badge > 0 && <span className="badge">{m.badge}</span>}
            <div className="ico">
              <Icon name={m.icon} />
            </div>
            <b>{m.title}</b>
            <span className="sub">{m.sub}</span>
            {m.sub2 && <span className="sub">{m.sub2}</span>}
          </Link>
        ))}
      </nav>

      <p className="tagline-foot">Hablale a Pichuco. Pichuco se encarga.</p>
    </main>
  );
}
