import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { NotFoundError } from "@/lib/permissions";
import {
  closeNonConformity,
  createElaboration,
  deactivateCleaningItem,
  deactivateDish,
  deactivateEquipment,
  recordCleaning,
  recordPestVisit,
  recordReception,
  recordTemperature,
  recordTraining,
  reportNonConformity,
  saveCleaningItem,
  saveDish,
  saveElaborationType,
  saveEquipment,
  setElaborationStatus,
} from "@/lib/services/sanidad";

const idOpt = z.object({ id: z.string().optional().nullable() });

/** Operaciones de controles sanitarios. La autorización está en cada servicio. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ op: string }> }) => {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const id = idOpt.parse(body).id ?? null;
  switch ((await params).op) {
    case "temperatura": {
      const r = await recordTemperature(user, body);
      return { outOfRange: r.outOfRange, range: r.range, ncId: r.nc?.id ?? null };
    }
    case "recepcion": {
      const r = await recordReception(user, body);
      return { problems: r.problems };
    }
    case "limpieza":
      await recordCleaning(user, body);
      return { ok: true };
    case "elaboracion": {
      const e = await createElaboration(user, body);
      return { id: e.id, lot: e.lot };
    }
    case "elaboracion-estado":
      await setElaborationStatus(user, z.string().parse(body.id), z.enum(["CONSUMIDO", "DESECHADO"]).parse(body.status), body.reason);
      return { ok: true };
    case "incidencia":
      await reportNonConformity(user, body);
      return { ok: true };
    case "incidencia-cerrar":
      await closeNonConformity(user, z.string().parse(body.id), body.correctiveAction ?? "");
      return { ok: true };
    case "equipo":
      return saveEquipment(user, id, body);
    case "equipo-baja":
      await deactivateEquipment(user, z.string().parse(body.id));
      return { ok: true };
    case "limpieza-item":
      return saveCleaningItem(user, id, body);
    case "limpieza-item-baja":
      await deactivateCleaningItem(user, z.string().parse(body.id));
      return { ok: true };
    case "tipo-elaboracion":
      return saveElaborationType(user, id, body);
    case "plato":
      return saveDish(user, id, body);
    case "plato-baja":
      await deactivateDish(user, z.string().parse(body.id));
      return { ok: true };
    case "plagas":
      return recordPestVisit(user, body);
    case "formacion":
      return recordTraining(user, body);
    default:
      throw new NotFoundError("Operación desconocida.");
  }
});
