/** Carga el catálogo real sin borrar nada: `npm run db:catalogo`. */
import { PrismaClient } from "@prisma/client";
import { CATALOG, loadCatalog } from "./catalogo";

const db = new PrismaClient();

loadCatalog(db)
  .then(() => console.log(`Catálogo cargado: ${CATALOG.length} proveedores, ${CATALOG.reduce((s, c) => s + c.products.length, 0)} productos.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
