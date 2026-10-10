"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

const ITEMS = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  { href: "/stock", label: "Stock", icon: "box" },
  { href: "/equipo", label: "Equipo", icon: "users" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <ul>
        {ITEMS.map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <Icon name={i.icon} />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
