import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const snapshotDirectory = process.argv[2];
const connectionString = process.env.DATABASE_URL;

if (!snapshotDirectory) {
  throw new Error(
    "Usage: node scripts/migrate-convex-to-postgres.mjs <extracted-snapshot-directory>",
  );
}

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

async function readJsonLines(tableName) {
  const filename = path.join(
    path.resolve(snapshotDirectory),
    tableName,
    "documents.jsonl",
  );
  const contents = await readFile(filename, "utf8");

  return contents
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const guestbookDocuments = await readJsonLines("guestbook");
const reactionDocuments = await readJsonLines("reactions");
const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

try {
  await sql.begin(async (transaction) => {
    await transaction`
      CREATE TABLE IF NOT EXISTS guestbook (
        id text PRIMARY KEY,
        creation_time_ms double precision NOT NULL,
        message text NOT NULL,
        author_name text NOT NULL,
        github_username text,
        github_id text,
        author_image text,
        signature text NOT NULL,
        created_at_ms bigint NOT NULL
      )
    `;
    await transaction`
      CREATE UNIQUE INDEX IF NOT EXISTS guestbook_github_id_unique
      ON guestbook (github_id)
      WHERE github_id IS NOT NULL
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS guestbook_created_at_idx
      ON guestbook (created_at_ms DESC)
    `;
    await transaction`
      CREATE TABLE IF NOT EXISTS reactions (
        id text PRIMARY KEY,
        creation_time_ms double precision NOT NULL,
        slug text NOT NULL,
        emoji text NOT NULL
      )
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS reactions_slug_idx
      ON reactions (slug)
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS reactions_slug_emoji_idx
      ON reactions (slug, emoji)
    `;

    if (guestbookDocuments.length > 0) {
      const rows = guestbookDocuments.map((document) => ({
        id: document._id,
        creation_time_ms: document._creationTime,
        message: document.message,
        author_name: document.authorName,
        github_username: document.githubUsername ?? null,
        github_id: document.githubId ?? null,
        author_image: document.authorImage ?? null,
        signature: document.signature,
        created_at_ms: document.createdAt,
      }));

      await transaction`
        INSERT INTO guestbook ${transaction(
          rows,
          "id",
          "creation_time_ms",
          "message",
          "author_name",
          "github_username",
          "github_id",
          "author_image",
          "signature",
          "created_at_ms",
        )}
        ON CONFLICT (id) DO UPDATE SET
          creation_time_ms = EXCLUDED.creation_time_ms,
          message = EXCLUDED.message,
          author_name = EXCLUDED.author_name,
          github_username = EXCLUDED.github_username,
          github_id = EXCLUDED.github_id,
          author_image = EXCLUDED.author_image,
          signature = EXCLUDED.signature,
          created_at_ms = EXCLUDED.created_at_ms
      `;
    }

    if (reactionDocuments.length > 0) {
      const rows = reactionDocuments.map((document) => ({
        id: document._id,
        creation_time_ms: document._creationTime,
        slug: document.slug,
        emoji: document.emoji,
      }));

      await transaction`
        INSERT INTO reactions ${transaction(
          rows,
          "id",
          "creation_time_ms",
          "slug",
          "emoji",
        )}
        ON CONFLICT (id) DO UPDATE SET
          creation_time_ms = EXCLUDED.creation_time_ms,
          slug = EXCLUDED.slug,
          emoji = EXCLUDED.emoji
      `;
    }
  });

  const migratedGuestbook = await sql`
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
    ORDER BY id
  `;
  const migratedReactions = await sql`
    SELECT id, creation_time_ms, slug, emoji
    FROM reactions
    ORDER BY id
  `;

  if (migratedGuestbook.length !== guestbookDocuments.length) {
    throw new Error(
      `Guestbook verification failed: source=${guestbookDocuments.length}, target=${migratedGuestbook.length}`,
    );
  }

  if (migratedReactions.length !== reactionDocuments.length) {
    throw new Error(
      `Reaction verification failed: source=${reactionDocuments.length}, target=${migratedReactions.length}`,
    );
  }

  const guestbookById = new Map(
    migratedGuestbook.map((row) => [row.id, row]),
  );
  for (const source of guestbookDocuments) {
    const target = guestbookById.get(source._id);
    const fieldsMatch =
      target &&
      Number(target.creation_time_ms) === source._creationTime &&
      target.message === source.message &&
      target.author_name === source.authorName &&
      target.github_username === (source.githubUsername ?? null) &&
      target.github_id === (source.githubId ?? null) &&
      target.author_image === (source.authorImage ?? null) &&
      target.signature === source.signature &&
      Number(target.created_at_ms) === source.createdAt;

    if (!fieldsMatch) {
      throw new Error(`Guestbook row verification failed for ${source._id}`);
    }
  }

  const reactionsById = new Map(
    migratedReactions.map((row) => [row.id, row]),
  );
  for (const source of reactionDocuments) {
    const target = reactionsById.get(source._id);
    const fieldsMatch =
      target &&
      Number(target.creation_time_ms) === source._creationTime &&
      target.slug === source.slug &&
      target.emoji === source.emoji;

    if (!fieldsMatch) {
      throw new Error(`Reaction row verification failed for ${source._id}`);
    }
  }

  console.log(
    `Migration verified: guestbook=${migratedGuestbook.length}, reactions=${migratedReactions.length}`,
  );
} finally {
  await sql.end();
}
