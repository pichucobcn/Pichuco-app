"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/sanidad", label: "Hoy" },
  { href: "/sanidad/temperaturas", label: "Temperaturas" },
  { href: "/sanidad/limpieza", label: "Limpieza" },
  { href: "/sanidad/etiquetas", label: "Etiquetas" },
  { href: "/sanidad/recepcion", label: "Recepción" },
  { href: "/sanidad/alergenos", label: "Alérgenos" },
  { href: "/sanidad/incidencias", label: "Incidencias" },
  { href: "/sanidad/registros", label: "Más" },
];

export function SanidadNav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Controles sanitarios">
      {TABS.map((t) => {
        const active = t.href === "/sanidad" ? path === "/sanidad" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
