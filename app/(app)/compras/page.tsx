import { requireUserPage } from "@/lib/auth";
import { ComingSoon } from "@/components/ComingSoon";

export default async function ComprasPage() {
  await requireUserPage();
  return (
    <ComingSoon title="Compras" phase="Fase 2">
      <p>Lista de compras, pedidos a proveedores con estados (Borrador → Pendiente aprobación → Enviado → Confirmado → Entregado) y reglas de aprobación por importe.</p>
      <p>
        Mientras tanto, si le decís a Pichuco <i>“Comprá 15 kilos de mozzarella”</i>, lo deja anotado como tarea para que no se pierda.
      </p>
    </ComingSoon>
  );
}
