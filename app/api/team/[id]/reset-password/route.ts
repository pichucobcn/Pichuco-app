import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { resetPassword } from "@/lib/services/team";

/** El jefe restablece la contraseña de alguien: vuelve a entrar con el código del equipo. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireUser();
  const { id } = await params;
  return resetPassword(actor, id);
});
