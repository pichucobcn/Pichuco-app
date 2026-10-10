import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSuppliers, nextDeliveryDate } from "@/lib/services/suppliers";
import { deliveryContacts, getPolicy } from "@/lib/services/purchases";
import { suggestedQuantity } from "@/lib/services/stock";
import { addDays, todayISO } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { NewOrderForm } from "./NewOrderForm";

export default async function NuevoPedidoPage({ searchParams }: { searchParams: Promise<{ proveedor?: string; producto?: string; cantidad?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "compras")) return <NoAccess title="Nuevo pedido" who="Gian y Martín" />;
  const sp = await searchParams;
  const [suppliers, policy, contacts] = await Promise.all([listSuppliers(user), getPolicy(), deliveryContacts()]);
  const tomorrow = addDays(todayISO(), 1);
  return (
    <main>
      <PageTitle title="Nuevo pedido" back="/compras" />
      <NewOrderForm
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          minOrder: s.minOrder,
          nextDelivery: nextDeliveryDate(s.deliveryDays, tomorrow),
          deliveryTime: s.deliveryTime,
          deliveryTimeTo: s.deliveryTimeTo,
          products: s.products.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
            category: p.category,
            price: p.lastPrice ?? p.usualPrice ?? 0,
            stock: p.stock,
            minStock: p.minStock,
            suggested: suggestedQuantity(p),
          })),
        }))}
        contacts={contacts.map((c) => ({ id: c.id, name: c.shortName, hasPhone: !!c.phone }))}
        defaultContactId={contacts.some((c) => c.id === user.id) ? user.id : ""}
        initial={{ supplierId: sp.proveedor, productId: sp.producto, quantity: sp.cantidad ? Number(sp.cantidad) : undefined }}
        policy={{
          autoLimit: user.purchaseAutoLimit ?? policy.autoLimit,
          managerLimit: policy.managerLimit,
          alwaysApprove: policy.alwaysApprove,
          isApprover: can(user, "compras_aprobar"),
        }}
      />
    </main>
  );
}
