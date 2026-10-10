import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtEur, fmtQty, isLow, listProducts, suggestedQuantity } from "@/lib/services/stock";
import { listSuppliers } from "@/lib/services/suppliers";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { StockAdjust } from "./StockAdjust";
import { NewProductForm } from "./NewProductForm";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const user = await requireUserPage();
  if (!can(user, "stock")) return <NoAccess title="Stock" who="Gian o Martín" />;
  const [products, suppliers] = await Promise.all([listProducts(user), listSuppliers(user)]);
  const cat = (await searchParams).cat;
  const categories = [...new Set(products.map((p) => p.category))];
  const low = products.filter(isLow);
  const shown = cat ? products.filter((p) => p.category === cat) : products;
  const canBuy = can(user, "compras");

  return (
    <main>
      <PageTitle title="Stock" />

      {low.length > 0 && (
        <section className="card alert-card">
          <div className="eyebrow">Bajo mínimo · {low.length}</div>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {low.map((p) => (
              <div key={p.id} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{p.name}</b>
                  <div className="small muted">
                    Quedan {fmtQty(p.stock, p.unit)} · mínimo {fmtQty(p.minStock, p.unit)}
                    {p.supplier ? ` · ${p.supplier.name}` : ""}
                  </div>
                </div>
                {canBuy && p.supplierId && (
                  <Link className="btn small" href={`/compras/nuevo?proveedor=${p.supplierId}&producto=${p.id}&cantidad=${suggestedQuantity(p)}`}>
                    Pedir {fmtQty(suggestedQuantity(p), p.unit)}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="tabs" aria-label="Categorías" style={{ marginTop: 14 }}>
        <Link href="/stock" className={!cat ? "active" : ""}>
          Todo
        </Link>
        {categories.map((c) => (
          <Link key={c} href={`/stock?cat=${encodeURIComponent(c)}`} className={cat === c ? "active" : ""}>
            {c}
          </Link>
        ))}
      </nav>

      {products.some((p) => p.minStock <= 0 || p.lastPrice == null) && (
        <p className="small" style={{ color: "var(--on-dark-muted)", margin: "0 0 10px" }}>
          Faltan mínimos o precios en {products.filter((p) => p.minStock <= 0 || p.lastPrice == null).length} productos. Entrá en cada uno y tocá “Editar ficha”: con el mínimo, la app avisa cuando hay que pedir; con el precio, calcula el coste de los pedidos.
        </p>
      )}
      <NewProductForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} categories={categories} />

      <div className="stack" style={{ marginTop: 12 }}>
        {shown.map((p) => {
          const ratio = p.minStock > 0 ? Math.min(1, p.stock / (p.minStock * 2)) : 1;
          const noMin = p.minStock <= 0;
          const tone = noMin ? "none" : isLow(p) ? "low" : p.stock < p.minStock * 1.3 ? "mid" : "ok";
          return (
            <article key={p.id} className="card product">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <Link href={`/stock/${p.id}`} style={{ flex: 1, minWidth: 0 }}>
                  <b className="product-name">{p.name}</b>
                  <div className="small muted">
                    {p.category}
                    {p.supplier ? ` · ${p.supplier.name}` : ""}
                    {p.lastPrice != null ? ` · ${fmtEur(p.lastPrice)}/${p.unit}` : ""}
                  </div>
                </Link>
                <div className="product-qty">
                  <span className={`qty ${tone}`}>{fmtQty(p.stock, p.unit)}</span>
                  <span className="small muted">{noMin ? "sin mínimo" : `mín. ${fmtQty(p.minStock, p.unit)}`}</span>
                </div>
              </div>
              {!noMin && (
                <div className={`level ${tone}`} aria-hidden="true">
                  <i style={{ width: `${Math.max(4, ratio * 100)}%` }} />
                  <b style={{ left: "50%" }} />
                </div>
              )}
              <StockAdjust id={p.id} unit={p.unit} stock={p.stock} />
            </article>
          );
        })}
      </div>
    </main>
  );
}
