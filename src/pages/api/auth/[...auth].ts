import { Auth } from "@auth/core";
import type { APIRoute } from "astro";
import { createAuthConfig } from "../../../../auth.config";
import { getEnv } from "../../../lib/cloudflare";

export const prerender = false;

const handler: APIRoute = ({ request, locals }) => Auth(request, createAuthConfig(getEnv(locals)));
export { handler as GET, handler as POST };
