import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

// Prisma 7 requires an explicit driver adapter; `new PrismaClient()` throws.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // The pool is cached on globalThis so Next's dev-mode hot reload doesn't
  // exhaust Postgres connections.
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const pool = new pg.Pool({ connectionString: getDatabaseUrl(), max: 5 });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/**
 * Constructed on first use rather than at import time, so `next build` can
 * collect page data on a machine that has no DATABASE_URL set.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_target, property, receiver) => Reflect.get(createPrismaClient(), property, receiver),
});
