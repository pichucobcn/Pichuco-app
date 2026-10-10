import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { unreadCount } from "@/lib/services/notifications";
import { Avatar } from "@/components/Avatar";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  const unread = await unreadCount(user);
  return (
    <>
      <div className="shell">
        <header className="topbar">
          <Link href="/" aria-label="Inicio">
            <img src="/brand/logo-crema.png" alt="Pichuco — Pizzería Porteña" className="logo" />
          </Link>
          <div className="who">
            <strong>{user.shortName}</strong>
            <span>{ROLE_LABEL[user.role]}</span>
          </div>
          <Link href="/equipo#yo" aria-label="Mi perfil">
            <Avatar name={user.name} color={user.avatarColor} />
          </Link>
          <Link href="/chat" className="bell" aria-label={`Avisos${unread ? ` (${unread} sin leer)` : ""}`}>
            <Icon name="bell" />
            {unread > 0 && <span className="badge">{unread}</span>}
          </Link>
        </header>
        {children}
      </div>
      <BottomNav />
    </>
  );
}
