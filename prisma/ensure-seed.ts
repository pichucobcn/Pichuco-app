/**
 * Para el despliegue: si la base está vacía (primer arranque), carga los
 * usuarios, el catálogo y los datos de prueba. Si ya hay datos, no toca nada.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

db.user
  .count()
  .then((n) => {
    if (n > 0) {
      console.log(`Base con datos (${n} usuarios): no se siembra.`);
      return;
    }
    console.log("Base vacía: cargando datos iniciales…");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
