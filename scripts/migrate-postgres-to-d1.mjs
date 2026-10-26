import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env.local");
const local = process.argv.includes("--local");
const mode = local ? "--local" : "--remote";
const tables = {
  guestbook: ["id", "creation_time_ms", "message", "author_name", "github_username",
    "github_id", "author_image", "signature", "created_at_ms"],
  reactions: ["id", "creation_time_ms", "slug", "emoji"],
};

// Capture Wrangler output privately: query results include guestbook signatures.
function wrangler(args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.resume();
    child.on("error", () => reject(new Error("Could not start Wrangler")));
    child.on("close", code => code === 0 ? resolveResult(output)
      : reject(new Error(`Wrangler D1 operation failed (exit ${code}); source backup retained`)));
  });
}

function literal(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid numeric source value");
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function canonical(rows, columns) {
  return JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id))
    .map(row => columns.map(column => row[column] ?? null)));
}
const digest = value => createHash("sha256").update(value).digest("hex");
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 1 });
try {
  const snapshot = await sql.begin("isolation level repeatable read read only", async tx => ({
    guestbook: (await tx`SELECT * FROM guestbook ORDER BY id`).map(row => ({
      ...row, created_at_ms: Number(row.created_at_ms),
    })),
    reactions: await tx`SELECT * FROM reactions ORDER BY id`,
  }));
  const directory = resolve("data/cloudflare-migration", new Date().toISOString().replaceAll(":", "-"));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, "snapshot.json"), JSON.stringify(snapshot), { mode: 0o600 });
  const statements = [];
  for (const [table, columns] of Object.entries(tables)) {
    for (const row of snapshot[table]) {
      statements.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(c => literal(row[c])).join(", ")}) ON CONFLICT(id) DO NOTHING;`);
    }
  }
  const filename = resolve(directory, "import.sql");
  await writeFile(filename, statements.join("\n"), { mode: 0o600 });
  if (statements.length) await wrangler(["d1", "execute", "DB", mode, "--file", filename, "--json"]);

  for (const [table, columns] of Object.entries(tables)) {
    const response = JSON.parse(await wrangler(["d1", "execute", "DB", mode,
      "--command", `SELECT ${columns.join(", ")} FROM ${table} ORDER BY id`, "--json"]));
    const target = response[0]?.results;
    if (!Array.isArray(target)) throw new Error(`No D1 results for ${table}`);
    const sourceIds = new Set(snapshot[table].map(row => row.id));
    const imported = target.filter(row => sourceIds.has(row.id));
    const sourceDigest = digest(canonical(snapshot[table], columns));
    if (sourceDigest !== digest(canonical(imported, columns))) {
      throw new Error(`D1 verification failed for ${table}; source backup retained`);
    }
    console.log(`${table}: ${imported.length} imported rows verified field-for-field; ${target.length} total in D1`);
  }
  console.log(`Private migration backup: ${directory}`);
} catch {
  // Connection errors can contain credentials. Keep diagnostic output generic.
  console.error("Migration failed. Source Postgres is unchanged; check credentials, D1 schema and any private backup.");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 1 });
}
