import { getEnv } from "./cloudflare.ts";

export function getDb(locals: App.Locals) {
  const db = getEnv(locals).DB;
  if (!db) throw new Error("D1 binding DB is not configured");
  return db;
}
