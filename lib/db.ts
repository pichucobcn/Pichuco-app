import { PrismaClient } from "@prisma/client";

/** El hash de la contraseña nunca sale de la base salvo que se pida explícitamente (`omit: { passwordHash: false }`). */
const makeClient = () => new PrismaClient({ omit: { user: { passwordHash: true } } });
type Db = ReturnType<typeof makeClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
