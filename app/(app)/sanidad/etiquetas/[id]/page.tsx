import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { allergenLabel, getElaboration, STORAGE_LABEL } from "@/lib/services/sanidad";
import { dateOf, prettyDate, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { PrintButton } from "@/components/sanidad/PrintButton";

export default async function EtiquetaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const e = await getElaboration(user, (await params).id);
  return (
    <main>
      <div className="no-print">
        <PageTitle title="Etiqueta" back="/sanidad/etiquetas" />
      </div>
      <div className="print-label">
        <div className="pl-brand">PICHUCO · PIZZERÍA PORTEÑA</div>
        <div className="pl-name">{e.name}</div>
        {e.quantity ? <div className="pl-qty">{e.quantity} {e.unit}</div> : null}
        <div className="pl-grid">
          <span>Elaborado</span>
          <b>
            {prettyDate(dateOf(e.madeAt))} {timeOf(e.madeAt)}
          </b>
          <span>Consumir antes de</span>
          <b className="pl-exp">{prettyDate(dateOf(e.expiresAt))}</b>
          <span>Lote</span>
          <b>{e.lot}</b>
          <span>Conservación</span>
          <b>{STORAGE_LABEL[e.storage]}</b>
          <span>Alérgenos</span>
          <b>{e.allergens.length ? e.allergens.map(allergenLabel).join(", ") : "—"}</b>
          <span>Responsable</span>
          <b>{e.user.shortName}</b>
        </div>
      </div>
      <div className="no-print" style={{ marginTop: 14 }}>
        <PrintButton label="Imprimir etiqueta" />
        <p className="small" style={{ color: "var(--on-dark-muted)", textAlign: "center" }}>
          Sirve cualquier impresora; con una de etiquetas adhesivas, elegí el tamaño de la etiqueta al imprimir.
        </p>
      </div>
    </main>
  );
}
