import type { Metadata } from "next";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Privacidad · Pichuco" };

/**
 * Texto base de política de privacidad. IMPORTANTE: revisarlo con la gestoría
 * o un asesor legal y completar razón social, NIF y dirección antes de publicar.
 */
export default async function PrivacidadPage() {
  const s = await getSettings();
  return (
    <main>
      <article className="card legal">
        <h1 className="public-title">Política de privacidad</h1>
        <p>
          <b>Responsable:</b> Pichuco Pizzería Porteña ({s.address}). Contacto: {s.phone}.
        </p>
        <p>
          <b>Qué datos tratamos:</b> nombre, teléfono y, si nos lo das, email, junto con los datos de tu reserva o pedido.
        </p>
        <p>
          <b>Para qué:</b> gestionar tu reserva o pedido para llevar, avisarte de cambios y, sólo si lo aceptás expresamente, enviarte novedades.
        </p>
        <p>
          <b>Base legal:</b> la ejecución de la reserva o pedido que nos pedís y, para las novedades, tu consentimiento, que podés retirar cuando quieras.
        </p>
        <p>
          <b>Cuánto tiempo:</b> mientras sea necesario para atenderte y cumplir obligaciones legales (por ejemplo, fiscales en caso de pago).
        </p>
        <p>
          <b>Con quién se comparten:</b> con nadie, salvo el proveedor de pagos cuando pagás online y los proveedores técnicos que alojan la aplicación, bajo contrato.
        </p>
        <p>
          <b>Tus derechos:</b> acceso, rectificación, supresión, oposición, limitación y portabilidad. Escribinos o llamanos y lo resolvemos. También podés reclamar ante la Agencia Española de Protección de Datos (aepd.es).
        </p>
      </article>
    </main>
  );
}
