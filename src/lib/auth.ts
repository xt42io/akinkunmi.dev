import { Auth } from "@auth/core";
import type { Session } from "@auth/core/types";
import { createAuthConfig } from "../../auth.config.ts";
import type { CloudflareEnv } from "./cloudflare.ts";

export type GuestbookSession = Session & {
  user?: Session["user"] & { id?: string; username?: string };
};

export async function getSession(request: Request, env: CloudflareEnv): Promise<GuestbookSession | null> {
  const response = await Auth(new Request(new URL("/api/auth/session", request.url), {
    headers: request.headers,
  }), createAuthConfig(env));
  if (!response.ok) throw new Error("Could not read authentication session");
  const session = await response.json() as GuestbookSession | null;
  return session?.user ? session : null;
}
