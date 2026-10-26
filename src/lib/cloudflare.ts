import type { D1Database } from "@cloudflare/workers-types";

export interface CloudflareEnv {
  DB: D1Database;
  AUTH_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  NOW_PLAYING_TOKEN?: string;
  WEBSITE_ORIGIN?: string;
  CORS_ORIGINS?: string;
}

export function getEnv(locals: App.Locals): CloudflareEnv {
  const env = locals.runtime?.env;
  if (!env) throw new Error("Cloudflare runtime bindings are not configured");
  return env;
}
