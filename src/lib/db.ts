import postgres, { type Sql } from "postgres";

declare global {
  // Reuse the pool during local hot reloads.
  // eslint-disable-next-line no-var
  var __akinkunmiPostgres: Sql | undefined;
}

export function getDb(): Sql {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalThis.__akinkunmiPostgres) {
    globalThis.__akinkunmiPostgres = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return globalThis.__akinkunmiPostgres;
}
