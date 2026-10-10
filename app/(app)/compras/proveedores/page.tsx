import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DAY_SHORT, listSuppliers } from "@/lib/services/suppliers";
import { fmtEur } from "@/lib/services/stock";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SupplierForm } from "./SupplierForm";

export default async function ProveedoresPage() {
  const user = await requireUserPage();
  if (!can(user, "proveedores") && !can(user, "compras")) return <NoAccess title="Proveedores" who="Gian y Martín" />;
  const suppliers = await listSuppliers(user);
  return (
    <main>
      <PageTitle title="Proveedores" back="/compras" />
      {can(user, "proveedores") && <SupplierForm />}
      <div className="stack" style={{ marginTop: 12 }}>
        {suppliers.map((s) => (
          <Link key={s.id} href={`/compras/proveedores/${s.id}`} className="card">
            <div className="row">
              <b style={{ flex: 1, fontSize: 17 }}>{s.name}</b>
              <span className="tag brown">{s.channel === "EMAIL" ? "Email" : s.channel === "TELEFONO" ? "Teléfono" : "WhatsApp"}</span>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Reparte {s.deliveryDays.map((d) => DAY_SHORT[d]).join(", ") || "a convenir"}
              {s.deliveryTime ? ` · ${s.deliveryTime}` : ""}
              {s.minOrder ? ` · mínimo ${fmtEur(s.minOrder)}` : ""}
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              {s.products.map((p) => p.name).join(" · ") || "Sin productos"}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
