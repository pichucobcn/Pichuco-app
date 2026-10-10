import type { Role } from "@prisma/client";

/**
 * Permisos por rol. Se comprueban en el backend (servicios y API) — el
 * frontend sólo los usa para no mostrar accesos que el usuario no puede usar.
 */
export const PERMISSIONS = [
  "fichaje", // fichar y ver lo propio
  "fichajes_equipo", // ver fichajes / horas / incidencias del equipo
  "personal", // gestionar personal y turnos, ver motivos de incidencias
  "tareas_todas", // ver y gestionar todas las tareas
  "tareas_crear", // crear tareas para cualquier persona
  "tareas_asignadas", // ver tareas propias y de su área
  "produccion", // ver y crear producción
  "comunicados_ver",
  "comunicados_crear",
  "chat",
  "agenda",
  "reservas",
  "takeaway",
  "clientes", // ver la ficha de clientes (datos personales)
  "stock",
  "compras", // crear y gestionar pedidos de compra
  "compras_aprobar", // aprobar pedidos que superan el límite automático
  "proveedores",
  "configuracion",
  "auditoria",
  "ai",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  JEFE: PERMISSIONS,
  JEFE_COCINA: [
    "fichaje",
    "tareas_todas",
    "tareas_crear",
    "tareas_asignadas",
    "produccion",
    "stock",
    "compras",
    "proveedores",
    "agenda",
    "comunicados_ver",
    "comunicados_crear",
    "chat",
    "ai",
  ],
  COCINERO: ["fichaje", "tareas_asignadas", "produccion", "agenda", "comunicados_ver", "chat", "ai"],
  CAMARERA: ["fichaje", "tareas_asignadas", "reservas", "agenda", "comunicados_ver", "chat", "ai"],
};

export const ROLE_LABEL: Record<Role, string> = {
  JEFE: "Jefe",
  JEFE_COCINA: "Jefe de cocina",
  COCINERO: "Cocinero",
  CAMARERA: "Camarera",
};

export function can(user: { role: Role }, perm: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(perm);
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "No tenés permiso para hacer esto.") {
    super(message);
  }
}

export class ValidationError extends Error {
  status = 400;
}

export class NotFoundError extends Error {
  status = 404;
}

export function assertCan(user: { role: Role }, perm: Permission, message?: string): void {
  if (!can(user, perm)) throw new ForbiddenError(message);
}
