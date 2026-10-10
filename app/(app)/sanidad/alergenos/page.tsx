import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ALLERGENS, listDishes } from "@/lib/services/sanidad";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SanidadNav } from "@/components/sanidad/SanidadNav";
import { PrintButton } from "@/components/sanidad/PrintButton";
import { DishEditor } from "@/components/sanidad/DishEditor";

export default async function AlergenosPage() {
  const user = await requireUserPage();
  if (!can(user, "sanidad")) return <NoAccess title="Sanidad" who="Gian y Martín" />;
  const dishes = await listDishes();
  const categories = [...new Set(dishes.map((d) => d.category))];
  const canEdit = can(user, "sanidad_gestion");
  return (
    <main>
      <div className="no-print">
        <PageTitle title="Alérgenos" back="/sanidad" />
        <SanidadNav />
        <p className="small" style={{ marginTop: 0, color: "var(--on-dark-muted)" }}>
          Tabla de los 14 alérgenos de declaración obligatoria. Mantenela al día y tenela a mano para los clientes.
        </p>
      </div>
      <section className="card allergen-sheet">
        <div className="print-only pl-brand" style={{ marginBottom: 8 }}>
          PICHUCO · PIZZERÍA PORTEÑA — Información sobre alérgenos
        </div>
        <p className="small muted no-print" style={{ margin: "0 0 6px" }}>
          Deslizá la tabla hacia los lados para ver los 14 alérgenos.
        </p>
        <div className="allergen-scroll">
          <table className="allergen-table">
            <thead>
              <tr>
                <th>Plato</th>
                {ALLERGENS.map((a) => (
                  <th key={a.key} title={a.label}>
                    <span className="vert">{a.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => [
                <tr key={cat} className="cat-row">
                  <td colSpan={ALLERGENS.length + 1}>{cat}</td>
                </tr>,
                ...dishes
                  .filter((d) => d.category === cat)
                  .map((d) => (
                    <tr key={d.id}>
                      <td className="dish-name">{d.name}</td>
                      {ALLERGENS.map((a) => (
                        <td key={a.key} className="alg-cell">
                          {d.allergens.includes(a.key) ? <span className="alg yes">●</span> : d.traces.includes(a.key) ? <span className="alg trace">○</span> : ""}
                        </td>
                      ))}
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          ● Contiene · ○ Puede contener trazas
        </p>
      </section>
      <div className="no-print" style={{ marginTop: 12 }}>
        <PrintButton label="Imprimir tabla de alérgenos" />
      </div>
      {canEdit && (
        <div className="no-print">
          <div className="filete">
            <h2>Editar platos</h2>
          </div>
          <DishEditor
            dishes={dishes.map((d) => ({ id: d.id, name: d.name, category: d.category, allergens: d.allergens, traces: d.traces }))}
            allergens={ALLERGENS.map((a) => ({ key: a.key, label: a.label }))}
            categories={categories}
          />
        </div>
      )}
    </main>
  );
}
