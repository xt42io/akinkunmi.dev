import type { APIRoute } from "astro";
import { getDb } from "../../lib/d1.ts";

export const prerender = false;
const allowedEmojis = new Set(["👍", "❤️", "🔥", "🚀", "👀"]);

export const GET: APIRoute = async ({ url, locals }) => {
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) return Response.json({ error: "Slug is required" }, { status: 400 });
  try {
    const { results } = await getDb(locals).prepare(`
      SELECT emoji, COUNT(*) AS count FROM reactions WHERE slug = ? GROUP BY emoji
    `).bind(slug).all<{ emoji: string; count: number }>();
    return Response.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Reactions D1 read failed");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const value = (body ?? {}) as Record<string, unknown>;
  const slug = typeof value.slug === "string" ? value.slug.trim() : "";
  const emoji = typeof value.emoji === "string" ? value.emoji : "";
  if (!slug) return Response.json({ error: "Slug is required" }, { status: 400 });
  if (!allowedEmojis.has(emoji)) return Response.json({ error: "Invalid reaction" }, { status: 400 });
  try {
    await getDb(locals).prepare(`
      INSERT INTO reactions (id, creation_time_ms, slug, emoji) VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), Date.now(), slug, emoji).run();
    return Response.json({ success: true });
  } catch {
    console.error("Reactions D1 write failed");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};
