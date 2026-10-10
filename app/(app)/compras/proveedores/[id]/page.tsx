import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DAY_SHORT, getSupplier } from "@/lib/services/suppliers";
import { STATUS_LABEL } from "@/lib/services/purchases";
import { fmtEur, fmtQty } from "@/lib/services/stock";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { SupplierForm } from "../SupplierForm";

export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "proveedores") && !can(user, "compras")) return <NoAccess title="Proveedores" who="Gian y Martín" />;
  const s = await getSupplier(user, (await params).id);
  const rows: [string, React.ReactNode][] = [
    ["Contacto", s.contactName],
    ["Teléfono", s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>],
    ["WhatsApp", s.whatsapp && <a href={`https://wa.me/${s.whatsapp.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">{s.whatsapp}</a>],
    ["Email", s.email && <a href={`mailto:${s.email}`}>{s.email}</a>],
    ["Atención", s.hours],
    ["Reparto", `${s.deliveryDays.map((d) => DAY_SHORT[d]).join(", ") || "a convenir"}${s.deliveryTime ? ` · ${s.deliveryTimeTo ? `entre las ${s.deliveryTime} y las ${s.deliveryTimeTo}` : `a las ${s.deliveryTime}`}` : ""}`],
    ["Pedido mínimo", s.minOrder != null ? fmtEur(s.minOrder) : null],
    ["Condiciones", s.conditions],
  ];
  return (
    <main>
      <PageTitle title={s.name} back="/compras/proveedores" />
      <section className="card">
        <table className="simple">
          <tbody>
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <tr key={k}>
                  <th style={{ width: 120 }}>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      {can(user, "proveedores") && (
        <div style={{ marginTop: 10 }}>
          <SupplierForm initial={s} />
        </div>
      )}
      <div className="filete">
        <h2>Productos</h2>
      </div>
      <div className="card">
        <table className="simple">
          <tbody>
            {s.products.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/stock/${p.id}`}>
                    <b>{p.name}</b>
                  </Link>
                </td>
                <td>{fmtQty(p.stock, p.unit)}</td>
                <td style={{ textAlign: "right" }}>{p.lastPrice != null ? `${fmtEur(p.lastPrice)}/${p.unit}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.orders.length > 0 && (
        <>
          <div className="filete">
            <h2>Últimos pedidos</h2>
          </div>
          <div className="card">
            <table className="simple">
              <tbody>
                {s.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/compras/${o.number}`}>
                        <b>#{o.number}</b>
                      </Link>
                    </td>
                    <td>{STATUS_LABEL[o.status]}</td>
                    <td style={{ textAlign: "right" }}>{fmtEur(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {can(user, "compras") && (
        <Link href={`/compras/nuevo?proveedor=${s.id}`} className="btn block" style={{ marginTop: 14 }}>
          Nuevo pedido a {s.name}
        </Link>
      )}
    </main>
  );
}
