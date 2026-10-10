import type { User } from "@prisma/client";

/** Quién hace la acción y por qué vía (pantalla o Pichuco AI). */
export type Actor = User;

export type ActionContext = {
  viaAi?: boolean;
  /** Mensaje original del usuario cuando la acción viene de Pichuco AI. */
  input?: string;
};
