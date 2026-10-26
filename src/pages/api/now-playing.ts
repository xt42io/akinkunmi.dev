import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { timingSafeEqual } from "node:crypto";
import { getCurrentTrack, saveCurrentTrack } from "../../lib/now-playing.server.ts";

export const prerender = false;

const webUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Expected an HTTP or HTTPS URL");

const trackSchema = z.object({
  title: z.string().trim().min(1),
  artist: z.string().trim().min(1),
  album: z.string().optional(),
  image: webUrl.optional(),
  source: z.enum(["desktop", "android"]),
  url: webUrl.optional(),
  playedAt: z.string().datetime({ offset: true }),
});

function corsHeaders(request: Request, url: URL): Headers | null {
  const websiteOrigin = process.env.WEBSITE_ORIGIN ?? import.meta.env?.WEBSITE_ORIGIN ?? url.origin;
  const configured = process.env.CORS_ORIGINS ?? import.meta.env?.CORS_ORIGINS
    ?? `${websiteOrigin},https://music.youtube.com`;
  const allowed = new Set([url.origin, ...configured.split(",").map((value) => value.trim())]);
  const origin = request.headers.get("Origin");
  if (origin && !allowed.has(origin)) return null;

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function forbidden() {
  return Response.json({ error: "Origin not allowed" }, {
    status: 403,
    headers: { "Cache-Control": "no-store", "Vary": "Origin" },
  });
}

function isAuthorized(request: Request): boolean {
  const token = process.env.NOW_PLAYING_TOKEN ?? import.meta.env?.NOW_PLAYING_TOKEN;
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(request.headers.get("Authorization") ?? "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export const OPTIONS: APIRoute = ({ request, url }) => {
  const headers = corsHeaders(request, url);
  return headers ? new Response(null, { status: 204, headers }) : forbidden();
};

export const GET: APIRoute = async ({ request, url }) => {
  const headers = corsHeaders(request, url);
  if (!headers) return forbidden();
  return Response.json({ track: await getCurrentTrack() }, { headers });
};

export const POST: APIRoute = async ({ request, url }) => {
  const headers = corsHeaders(request, url);
  if (!headers) return forbidden();
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid track", fields: parsed.error.flatten().fieldErrors }, {
      status: 422,
      headers,
    });
  }

  await saveCurrentTrack(parsed.data);
  return Response.json({ ok: true }, { headers });
};
