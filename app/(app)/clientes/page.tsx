import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPhone, listCustomers } from "@/lib/services/customers";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "clientes")) return <NoAccess title="Clientes" who="Martín" />;
  const q = (await searchParams).q ?? "";
  const list = await listCustomers(user, q);
  return (
    <main>
      <PageTitle title="Clientes" />
      <form className="composer" style={{ marginTop: 0, marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, teléfono o email" aria-label="Buscar cliente" />
      </form>
      <div className="card chat-list">
        {list.length === 0 && <p className="empty">No hay clientes{q ? " con esa búsqueda" : ""}.</p>}
        {list.map((c) => (
          <Link key={c.id} href={`/clientes/${c.id}`} className="chat-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{c.name}</b>
              <div className="small muted">
                {formatPhone(c.phone)}
                {c.email ? ` · ${c.email}` : ""}
              </div>
            </div>
            <div className="small muted" style={{ textAlign: "right" }}>
              {c._count.reservations} reservas
              <br />
              {c._count.takeawayOrders} pedidos
            </div>
          </Link>
        ))}
      </div>
      <p className="small" style={{ marginTop: 12, color: "var(--on-dark-muted)" }}>
        Datos personales: sólo para gestionar reservas y pedidos. Si un cliente pide que borremos sus datos, se hace desde su ficha.
      </p>
    </main>
  );
}
