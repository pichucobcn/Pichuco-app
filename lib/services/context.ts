import type { User } from "@prisma/client";

/** Usuario tal como lo devuelve la base (sin el hash de la contraseña). */
export type AppUser = Omit<User, "passwordHash">;

/** Quién hace la acción y por qué vía (pantalla o Pichuco AI). */
export type Actor = AppUser;

export type ActionContext = {
  viaAi?: boolean;
  /** Mensaje original del usuario cuando la acción viene de Pichuco AI. */
  input?: string;
};
