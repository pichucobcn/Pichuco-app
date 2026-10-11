import { requireUserPage } from "@/lib/auth";
import { availableDatasets } from "@/lib/services/exportar";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { ExportForm } from "./ExportForm";

export default async function ExportarPage() {
  const user = await requireUserPage();
  const sets = availableDatasets(user).map(({ key, label, description }) => ({ key, label, description }));
  if (!sets.length) return <NoAccess title="Exportar datos" who="Martín y Gian" />;
  return (
    <main>
      <PageTitle title="Exportar datos" />
      <p className="small muted" style={{ marginTop: 0 }}>
        Descargá los registros en un archivo que abre Excel. Si dejás las fechas vacías, sale <b>todo el histórico</b>.
      </p>
      <ExportForm sets={sets} />
    </main>
  );
}
