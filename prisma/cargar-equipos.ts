/** Carga las neveras y congeladores reales sin tocar lo ya cargado (`npm run db:equipos`, y en cada despliegue). */
import { PrismaClient } from "@prisma/client";
import { loadEquipment } from "./equipos";

const db = new PrismaClient();
loadEquipment(db)
  .then((ids) => console.log(`Equipos de frío: ${Object.keys(ids).join(", ")}.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
