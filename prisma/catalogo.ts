/**
 * Catálogo real de proveedores y productos de Pichuco.
 *
 * Precios, stock y mínimos no se conocen todavía: quedan vacíos y se cargan
 * desde la app (Stock → producto → Editar, y "Recuento").
 *
 * `loadCatalog` es idempotente: crea lo que falta y no pisa precios ni stock
 * ya cargados, así que se puede volver a ejecutar sobre una base en uso
 * (`npm run db:catalogo`).
 */
import type { PrismaClient } from "@prisma/client";

type Item = [name: string, category: string, unit: string];

export const CATALOG: { supplier: string; products: Item[] }[] = [
  {
    supplier: "Kimon",
    products: [
      ["Tomate canario", "Verdura y fruta", "kg"],
      ["Salsa de tomate 4 kg", "Salsas y conservas", "latas"],
      ["Pimiento rojo", "Verdura y fruta", "kg"],
      ["Champiñón laminado", "Verdura y fruta", "kg"],
      ["Orégano seco", "Especias", "kg"],
      ["Pimentón dulce", "Especias", "kg"],
      ["Ají molido", "Especias", "kg"],
      ["Pimienta negra en grano", "Especias", "kg"],
      ["Aceite de oliva virgen extra", "Aceites", "l"],
      ["Perejil", "Verdura y fruta", "manojos"],
      ["Albahaca", "Verdura y fruta", "manojos"],
      ["Mezclum", "Verdura y fruta", "kg"],
      ["Patata agria", "Verdura y fruta", "kg"],
      ["Limón", "Verdura y fruta", "kg"],
      ["Calabaza", "Verdura y fruta", "kg"],
      ["Cebolla blanca", "Verdura y fruta", "kg"],
      ["Huevo", "Huevos", "docenas"],
    ],
  },
  {
    supplier: "Ken Foods",
    products: [
      ["Levadura", "Panadería", "kg"],
      ["Leche entera", "Lácteos y quesos", "l"],
      ["Nata", "Lácteos y quesos", "l"],
      ["Mascarpone", "Lácteos y quesos", "kg"],
      ["Brie", "Lácteos y quesos", "kg"],
      ["Provolone", "Lácteos y quesos", "kg"],
      ["Queso azul", "Lácteos y quesos", "kg"],
    ],
  },
  {
    supplier: "Cusiné",
    products: [
      ["Harina", "Harinas y secos", "kg"],
      ["Harina de garbanzo", "Harinas y secos", "kg"],
      ["Membrillo", "Repostería", "kg"],
      ["Azúcar", "Harinas y secos", "kg"],
      ["Azúcar glass", "Repostería", "kg"],
      ["Bicarbonato", "Repostería", "kg"],
      ["Polvo de hornear", "Repostería", "kg"],
      ["Sal", "Harinas y secos", "kg"],
      ["Dátiles", "Frutos secos", "kg"],
      ["Mangas pasteleras", "Material", "paquetes"],
      ["Nueces y otros frutos secos", "Frutos secos", "kg"],
    ],
  },
  {
    supplier: "Roysan",
    products: [
      ["Jamón dulce", "Embutidos", "kg"],
      ["Jamón serrano (paleta curada)", "Embutidos", "kg"],
      ["Bacon ahumado", "Embutidos", "kg"],
    ],
  },
  {
    supplier: "Crusat",
    products: [
      ["Coca-Cola", "Refrescos", "cajas"],
      ["Coca-Cola Zero", "Refrescos", "cajas"],
      ["Fanta naranja", "Refrescos", "cajas"],
      ["Fuze Tea limón", "Refrescos", "cajas"],
      ["Aquarius limón", "Refrescos", "cajas"],
    ],
  },
  {
    supplier: "Damm",
    products: [
      ["Barril Estrella Damm", "Cervezas", "barriles"],
      ["Barril Turia", "Cervezas", "barriles"],
      ["Damm Lemon", "Cervezas", "cajas"],
      ["Free Damm", "Cervezas", "cajas"],
      ["Free Damm Tostada", "Cervezas", "cajas"],
      ["Daura", "Cervezas", "cajas"],
      ["Vichy Catalán", "Aguas", "cajas"],
      ["Sifón", "Aguas", "cajas"],
    ],
  },
  {
    supplier: "Merkapizza",
    products: [
      ["Salsa de tomate premium", "Salsas y conservas", "latas"],
      ["Queso napoli rallado", "Lácteos y quesos", "kg"],
    ],
  },
  {
    supplier: "Caro Import",
    products: [
      ["Tapas de empanada frescas para freír", "Masas y panadería", "paquetes"],
      ["Chocolinas", "Repostería", "paquetes"],
    ],
  },
  {
    supplier: "Lácteos da Limia",
    products: [
      ["Muzzarella rallada", "Lácteos y quesos", "kg"],
      ["Cuartirolo", "Lácteos y quesos", "kg"],
    ],
  },
];

/** Crea proveedores y productos que falten. Devuelve los ids por nombre. */
export async function loadCatalog(db: PrismaClient) {
  const suppliers: Record<string, string> = {};
  const products: Record<string, string> = {};
  for (const { supplier, products: items } of CATALOG) {
    const s = (await db.supplier.findFirst({ where: { name: supplier } })) ?? (await db.supplier.create({ data: { name: supplier, deliveryDays: [] } }));
    suppliers[supplier] = s.id;
    for (const [name, category, unit] of items) {
      const p =
        (await db.product.findFirst({ where: { name, supplierId: s.id } })) ??
        (await db.product.create({ data: { name, category, unit, supplierId: s.id } }));
      products[name] = p.id;
    }
  }
  return { suppliers, products };
}
