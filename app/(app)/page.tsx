import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { aiMode } from "@/lib/ai/agent";
import { greeting } from "@/lib/services/agenda";
import { unreadAnnouncements } from "@/lib/services/announcements";
import { listTasks } from "@/lib/services/tasks";
import { currentJourney } from "@/lib/services/clock";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/dates";
import { db } from "@/lib/db";
import { unreadChats } from "@/lib/services/chat";
import { foodSafetyPendingCount } from "@/lib/services/sanidad";
import { Icon } from "@/components/Icon";
import { PichucoChat } from "@/components/PichucoChat";

export default async function Home() {
  const user = await requireUserPage();
  const [g, unread, openToday, journey, chats, toApprove, toSend, health] = await Promise.all([
    greeting(user),
    unreadAnnouncements(user),
    listTasks(user, { date: todayISO(), status: "ABIERTAS", mine: !can(user, "tareas_todas") }),
    currentJourney(user),
    unreadChats(user),
    can(user, "compras_aprobar") ? db.purchaseOrder.count({ where: { status: "PENDIENTE_APROBACION" } }) : Promise.resolve(0),
    can(user, "compras") ? db.purchaseOrder.count({ where: { status: "APROBADO" } }) : Promise.resolve(0),
    foodSafetyPendingCount(user),
  ]);
  const comprasSub = toApprove ? `${toApprove} para aprobar` : toSend ? `${toSend} para enviar` : "Pedidos y proveedores";
  const mode = aiMode();
  const clockLabel = journey.state === "fuera" ? "Entrada / Salida" : journey.state === "en pausa" ? "En pausa" : "Trabajando";

  const modules = [
    { href: "/fichar", icon: "clock", title: "Fichar", sub: clockLabel, sub2: "Pausas", badge: 0 },
    { href: "/compras", icon: "cart", title: "Compras", sub: comprasSub, badge: toApprove + toSend },
    { href: "/tareas", icon: "tasks", title: "Tareas", sub: "Producción y pendientes", badge: openToday.length },
    { href: "/comunicados", icon: "megaphone", title: "Comunicados", sub: "Avisos del equipo", badge: unread },
    { href: "/chat", icon: "chat", title: "Chat", sub: chats ? `${chats} sin leer` : "Mensajes del equipo", badge: chats },
    ...(can(user, "sanidad")
      ? [{ href: "/sanidad", icon: "shield", title: "Sanidad", sub: health ? `${health} pendientes` : "Controles al día", badge: health }]
      : []),
  ];

  return (
    <main>
      <section className="ai-hero" aria-label="Pichuco">
        <div className="head">
          <span className={`status-dot ${mode === "demo" ? "demo" : ""}`}>{mode === "claude" ? "En línea" : "En línea · demo"}</span>
          <span className="spacer" />
          <Link href="/pichuco" className="link">
            Historial
          </Link>
        </div>
        <div className="body">
          <img src="/brand/pichuco-solo.png" alt="Pichuco con su bandoneón" className="mascot" />
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

      <div className="guarda pie" aria-hidden="true" />
    </main>
  );
}
