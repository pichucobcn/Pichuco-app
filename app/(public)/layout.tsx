import Link from "next/link";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

/** Web pública para clientes: reservas y pedidos para llevar. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="shell public-shell">
      <header className="public-head">
        <img src="/brand/logo-crema.png" alt="Pichuco — Pizzería Porteña" className="public-logo" />
        <nav className="tabs public-nav" aria-label="Secciones">
          <Link href="/reservar">Reservar mesa</Link>
          <Link href="/pedir">Pedir para llevar</Link>
        </nav>
      </header>
      {children}
      <footer className="public-foot">
        <p>
          {s.address} · <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
        </p>
        <p>
          <Link href="/privacidad">Política de privacidad</Link>
        </p>
      </footer>
    </div>
  );
}
