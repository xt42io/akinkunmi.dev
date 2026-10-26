import type { APIRoute } from "astro";
import { getSession } from "../../lib/auth.ts";
import { getDb } from "../../lib/d1.ts";
import { getEnv } from "../../lib/cloudflare.ts";

export const prerender = false;

interface GuestbookRow {
  id: string;
  creation_time_ms: number;
  message: string;
  author_name: string;
  github_username: string | null;
  github_id: string | null;
  author_image: string | null;
  signature: string;
  created_at_ms: number;
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { results } = await getDb(locals).prepare(`
      SELECT id, creation_time_ms, message, author_name, github_username,
        github_id, author_image, signature, created_at_ms
      FROM guestbook ORDER BY created_at_ms DESC
    `).all<GuestbookRow>();
    return Response.json(results.map((row) => ({
      _id: row.id,
      _creationTime: row.creation_time_ms,
      message: row.message,
      authorName: row.author_name,
      githubUsername: row.github_username ?? undefined,
      githubId: row.github_id ?? undefined,
      authorImage: row.author_image ?? undefined,
      signature: row.signature,
      createdAt: row.created_at_ms,
    })), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Guestbook D1 read failed");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const session = await getSession(request, getEnv(locals));
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const { message, signature } = (body ?? {}) as Record<string, unknown>;
    if (typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }
    if (typeof signature !== "string" || !signature) {
      return Response.json({ error: "Signature is required" }, { status: 400 });
    }

    const { id, username, name, image } = session.user;
    if (!id || id === "undefined" || !username || username === "undefined" || !name) {
      return Response.json({ error: "Invalid session. Please sign out and sign back in." }, { status: 401 });
    }

    const now = Date.now();
    const result = await getDb(locals).prepare(`
      INSERT INTO guestbook (id, creation_time_ms, message, author_name,
        github_username, github_id, author_image, signature, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (github_id) WHERE github_id IS NOT NULL DO NOTHING
    `).bind(crypto.randomUUID(), now, message.trim(), name, username, id,
      image ?? null, signature, now).run();
    if (result.meta.changes === 0) {
      return Response.json({ error: "You have already signed the guestbook." }, { status: 409 });
    }
    return Response.json({ success: true });
  } catch {
    console.error("Guestbook D1 write failed");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};
