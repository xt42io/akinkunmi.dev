import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mockGuestbookEntries } from "./fixtures/guestbook.mjs";

if (process.argv.length > 2) throw new Error("This seeder only writes to local D1 and accepts no flags.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Local guestbook seeding failed.");
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const entries = mockGuestbookEntries();
const sql = entries.map(entry => `INSERT INTO guestbook
  (id, creation_time_ms, message, author_name, github_id, signature, created_at_ms)
  VALUES (${quote(entry._id)}, ${entry._creationTime}, ${quote(entry.message)}, ${quote(entry.authorName)}, ${quote(entry.githubId)}, ${quote(entry.signature)}, ${entry.createdAt})
  ON CONFLICT(id) DO UPDATE SET message=excluded.message, signature=excluded.signature,
    creation_time_ms=excluded.creation_time_ms, created_at_ms=excluded.created_at_ms;`).join("\n");
const directory = join(root, "data/guestbook");
await mkdir(directory, { recursive: true });
const path = join(directory, "seed.sql");
await writeFile(path, sql);
run(["d1", "migrations", "apply", "DB", "--local"]);
run(["d1", "execute", "DB", "--local", "--file", path]);
console.log(`Added ${entries.length} fictional sample notes to local D1. Rerunning updates these samples without duplicates.`);
