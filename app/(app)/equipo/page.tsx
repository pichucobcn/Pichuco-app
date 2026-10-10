import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can, ROLE_LABEL, ROLE_PERMISSIONS } from "@/lib/permissions";
import { teamOverview } from "@/lib/services/team";
import { incidentsForDate } from "@/lib/services/incidents";
import { todayISO } from "@/lib/dates";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { PageTitle } from "@/components/PageTitle";
import { LogoutButton } from "./LogoutButton";

const PERM_LABEL: Record<string, string> = {
  fichaje: "Fichaje", fichajes_equipo: "Fichajes del equipo", personal: "Personal", tareas_todas: "Todas las tareas",
  tareas_crear: "Asignar tareas", tareas_asignadas: "Tareas asignadas", produccion: "Producción", comunicados_ver: "Comunicados",
  comunicados_crear: "Publicar comunicados", chat: "Chat", agenda: "Agenda", reservas: "Reservas", takeaway: "Pedidos para llevar",
  stock: "Stock", compras: "Compras", proveedores: "Proveedores", configuracion: "Configuración", auditoria: "Historial completo", ai: "Pichuco AI",
};

export default async function EquipoPage() {
  const user = await requireUserPage();
  const today = todayISO();
  const [team, incidents] = await Promise.all([teamOverview(user, today), incidentsForDate(user, today)]);

  return (
    <main>
      <PageTitle title="Equipo" />
      <div className="stack">
        {team.map((m) => {
          const inc = incidents.filter((i) => i.userId === m.id);
          return (
            <div key={m.id} className="card row">
              <Avatar name={m.name} color={m.avatarColor} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{m.name}</b>
                <div className="small muted">{m.roleLabel}</div>
                <div className="row small" style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  <span className="tag brown">{m.shift ? `Hoy ${m.shift.start}–${m.shift.end}` : "Libre hoy"}</span>
                  <span className={`tag ${m.status === "trabajando" ? "green" : m.status === "en pausa" ? "amber" : "brown"}`}>{m.status}</span>
                  {inc.map((i) => (
                    <span key={i.id} className="tag red">
                      {i.type === "RETRASO" ? `Retraso ${i.minutes}'` : "Ausente"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="filete" id="yo">
        <h2>Mi cuenta</h2>
      </div>
      <div className="card stack">
        <div className="row">
          <Avatar name={user.name} color={user.avatarColor} size={52} />
          <div>
            <b>{user.name}</b>
            <div className="small muted">
              {ROLE_LABEL[user.role]} · {user.email}
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {ROLE_PERMISSIONS[user.role].map((p) => (
            <span key={p} className="tag brown">
              {PERM_LABEL[p] ?? p}
            </span>
          ))}
        </div>
        <Link href="/historial" className="btn secondary">
          <Icon name="history" /> {can(user, "auditoria") ? "Historial de acciones (todo el equipo)" : "Mi historial de acciones"}
        </Link>
        <LogoutButton />
      </div>
    </main>
  );
}
