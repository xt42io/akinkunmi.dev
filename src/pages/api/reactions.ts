import type { APIRoute } from "astro";
import { getDb } from "../../lib/db";

export const prerender = false;

const allowedEmojis = new Set(["👍", "❤️", "🔥", "🚀", "👀"]);

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug")?.trim();

  if (!slug) {
    return Response.json({ error: "Slug is required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql<{ emoji: string; count: number }[]>`
      SELECT emoji, COUNT(*)::int AS count
      FROM reactions
      WHERE slug = ${slug}
      GROUP BY emoji
      ORDER BY emoji
    `;

    return Response.json(rows, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Reactions query error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const emoji = typeof body.emoji === "string" ? body.emoji : "";

    if (!slug) {
      return Response.json({ error: "Slug is required" }, { status: 400 });
    }

    if (!allowedEmojis.has(emoji)) {
      return Response.json({ error: "Invalid reaction" }, { status: 400 });
    }

    const now = Date.now();
    const sql = getDb();
    await sql`
      INSERT INTO reactions (id, creation_time_ms, slug, emoji)
      VALUES (${crypto.randomUUID()}, ${now}, ${slug}, ${emoji})
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Reaction insert error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};
