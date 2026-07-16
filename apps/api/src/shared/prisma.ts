import { PrismaClient, Prisma } from '@smartgym/db';

// Neon (serverless Postgres) closes idle connections, which surfaces as a
// P1017 "Server has closed the connection" on the first query after an idle
// period — Prisma doesn't retry the in-flight request. These transient
// connection errors are safe to retry; the next attempt reconnects.
const RETRYABLE_CONNECTION_CODES = new Set(['P1017', 'P1001', 'P1002']);
const MAX_RETRIES = 3;

function isRetryableConnectionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_CONNECTION_CODES.has(error.code)
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const basePrisma = new PrismaClient();

const extendedPrisma = basePrisma.$extends({
  query: {
    async $allOperations({ query, args }) {
      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        try {
          return await query(args);
        } catch (error) {
          if (!isRetryableConnectionError(error)) throw error;
          lastError = error;
          await delay(100 * (attempt + 1));
        }
      }
      throw lastError;
    },
  },
});

// The extension only adds transparent retry behaviour; the runtime surface is
// identical to PrismaClient, so we expose it under the base type to keep
// $transaction callbacks and helper signatures compatible across the app.
export const prisma = extendedPrisma as unknown as PrismaClient;
