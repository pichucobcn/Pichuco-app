import { requireUserPage } from "@/lib/auth";
import { ComingSoon } from "@/components/ComingSoon";

export default async function StockPage() {
  await requireUserPage();
  return (
    <ComingSoon title="Stock" phase="Fase 2">
      <p>Productos, unidades, stock actual y mínimo, proveedor habitual y precios.</p>
      <p>Pichuco va a avisar cuando algo esté por debajo del mínimo (por ejemplo: “Mozzarella: 4 kg, mínimo 10 kg”) y preparar el pedido.</p>
    </ComingSoon>
  );
}
