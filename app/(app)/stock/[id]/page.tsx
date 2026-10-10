import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtEur, fmtQty, getProduct, isLow, suggestedQuantity } from "@/lib/services/stock";
import { dateOf, prettyDate, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { StockAdjust } from "../StockAdjust";
import { ProductEditForm } from "./ProductEditForm";
import { db } from "@/lib/db";

const REASON: Record<string, string> = { ENTRADA_PEDIDO: "Entrada de pedido", AJUSTE: "Ajuste", CONSUMO: "Consumo", MERMA: "Merma" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "stock")) return <NoAccess title="Stock" who="Gian o Martín" />;
  const p = await getProduct(user, (await params).id);
  const [suppliers, cats] = await Promise.all([
    db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { active: true }, select: { category: true }, distinct: ["category"] }),
  ]);
  return (
    <main>
      <PageTitle title={p.name} back="/stock" />
      <section className="card stack">
        <div className="grid-2" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <div className="stat">
            <div className="n" style={{ color: isLow(p) ? "var(--burgundy)" : undefined }}>{fmtQty(p.stock, p.unit)}</div>
            <div className="l">Stock</div>
          </div>
          <div className="stat">
            <div className="n">{p.minStock > 0 ? fmtQty(p.minStock, p.unit) : "—"}</div>
            <div className="l">Mínimo</div>
          </div>
          <div className="stat">
            <div className="n">{p.lastPrice != null ? fmtEur(p.lastPrice) : "—"}</div>
            <div className="l">Último precio</div>
          </div>
        </div>
        <div className="small muted">
          {p.category} · Precio habitual {p.usualPrice != null ? `${fmtEur(p.usualPrice)}/${p.unit}` : "—"}
          {p.supplier && (
            <>
              {" · "}
              <Link href={`/compras/proveedores/${p.supplier.id}`} style={{ textDecoration: "underline" }}>
                {p.supplier.name}
              </Link>
            </>
          )}
        </div>
        <StockAdjust id={p.id} unit={p.unit} stock={p.stock} />
        <ProductEditForm
          product={{ id: p.id, name: p.name, category: p.category, unit: p.unit, minStock: p.minStock, usualPrice: p.usualPrice, supplierId: p.supplierId }}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          categories={cats.map((c) => c.category).sort()}
        />
        {can(user, "compras") && p.supplierId && (
          <Link className="btn block" href={`/compras/nuevo?proveedor=${p.supplierId}&producto=${p.id}&cantidad=${suggestedQuantity(p) || 1}`}>
            Hacer pedido
          </Link>
        )}
      </section>
      <div className="filete">
        <h2>Movimientos</h2>
      </div>
      <div className="card">
        {p.movements.length === 0 ? (
          <p className="empty">Sin movimientos todavía.</p>
        ) : (
          <table className="simple">
            <tbody>
              {p.movements.map((m) => (
                <tr key={m.id}>
                  <td>
                    {prettyDate(dateOf(m.createdAt))} {timeOf(m.createdAt)}
                    <div className="small muted">
                      {REASON[m.reason] ?? m.reason} · {m.user.shortName}
                      {m.note ? ` · ${m.note}` : ""}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <b style={{ color: m.delta < 0 ? "var(--burgundy)" : "var(--green)" }}>
                      {m.delta > 0 ? "+" : ""}
                      {fmtQty(m.delta, p.unit)}
                    </b>
                    <div className="small muted">→ {fmtQty(m.stockAfter, p.unit)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
