import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listOrders, orderSummary, STATUS_LABEL } from "@/lib/services/purchases";
import { fmtEur } from "@/lib/services/stock";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { Icon } from "@/components/Icon";
import { OrderCard } from "@/components/compras/OrderCard";

const TABS = [
  { id: "abiertos", label: "Abiertos" },
  { id: "aprobar", label: "Para aprobar" },
  { id: "historial", label: "Historial" },
];

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "compras"))
    return (
      <NoAccess title="Compras" who="Gian y Martín">
        <p className="small" style={{ marginBottom: 0 }}>
          ¿Falta algo? Decile a Pichuco, por ejemplo “Comprá 15 kilos de mozzarella”, y se lo paso a Gian.
        </p>
      </NoAccess>
    );
  const tab = (await searchParams).tab ?? "abiertos";
  const [open, pending] = await Promise.all([listOrders(user, { status: "ABIERTOS" }), listOrders(user, { status: "PENDIENTE_APROBACION" })]);
  const orders =
    tab === "aprobar" ? pending : tab === "historial" ? (await listOrders(user)).filter((o) => ["ENTREGADO", "CANCELADO"].includes(o.status)) : open;

  return (
    <main>
      <PageTitle title="Compras" />
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Link href="/compras/nuevo" className="btn">
          <Icon name="plus" size={18} /> Nuevo pedido
        </Link>
        <Link href="/compras/proveedores" className="btn secondary">
          <Icon name="truck" size={18} /> Proveedores
        </Link>
      </div>
      <nav className="tabs" aria-label="Pedidos">
        {TABS.map((t) => (
          <Link key={t.id} href={`/compras?tab=${t.id}`} className={tab === t.id ? "active" : ""}>
            {t.label}
            {t.id === "aprobar" && pending.length > 0 ? ` · ${pending.length}` : ""}
          </Link>
        ))}
      </nav>
      <div className="stack">
        {orders.length === 0 && <p className="empty">No hay pedidos acá.</p>}
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            o={{
              number: o.number,
              status: o.status,
              statusLabel: STATUS_LABEL[o.status],
              supplier: o.supplier.name,
              total: fmtEur(o.total),
              items: orderSummary(o),
              deliveryDate: o.deliveryDate,
              deliveryTime: o.deliveryTime,
              createdBy: o.createdBy.shortName,
              createdByAi: o.createdByAi,
            }}
          />
        ))}
      </div>
      {can(user, "configuracion") && (
        <Link href="/compras/reglas" className="btn add block" style={{ marginTop: 16 }}>
          Reglas de aprobación de compras
        </Link>
      )}
    </main>
  );
}
