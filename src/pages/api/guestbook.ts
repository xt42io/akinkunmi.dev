import type { APIRoute } from "astro";
import { getSession } from "auth-astro/server";
import { getDb } from "../../lib/db";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT
        id,
        creation_time_ms,
        message,
        author_name,
        github_username,
        github_id,
        author_image,
        signature,
        created_at_ms
      FROM guestbook
      ORDER BY created_at_ms DESC
    `;

    return Response.json(
      rows.map((row) => ({
        _id: row.id,
        _creationTime: Number(row.creation_time_ms),
        message: row.message,
        authorName: row.author_name,
        githubUsername: row.github_username ?? undefined,
        githubId: row.github_id ?? undefined,
        authorImage: row.author_image ?? undefined,
        signature: row.signature,
        createdAt: Number(row.created_at_ms),
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Guestbook query error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { message, signature } = body;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!signature || typeof signature !== "string") {
      return new Response(JSON.stringify({ error: "Signature is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const githubId = (session.user as any).id;
    const githubUsername = (session.user as any).username;
    const authorName = session.user.name;

    if (
      !githubId ||
      githubId === "undefined" ||
      !githubUsername ||
      githubUsername === "undefined" ||
      !authorName
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid session. Please sign out and sign back in.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const now = Date.now();
    const sql = getDb();
    await sql`
      INSERT INTO guestbook (
        id,
        creation_time_ms,
        message,
        author_name,
        github_username,
        github_id,
        author_image,
        signature,
        created_at_ms
      ) VALUES (
        ${crypto.randomUUID()},
        ${now},
        ${message.trim()},
        ${authorName},
        ${githubUsername},
        ${githubId},
        ${session.user.image ?? null},
        ${signature},
        ${now}
      )
    `;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Guestbook API error:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return Response.json(
        { error: "You have already signed the guestbook." },
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
