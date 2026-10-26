/**
 * Bank statement -> SQLite ETL
 *
 * Reads the bank's "Customer Statement" .xlsx export and writes a queryable
 * SQLite database at data/money.db.
 *
 * Usage:
 *   node scripts/build-money-db.mjs "/path/to/Customer Statement.xlsx"
 *   node scripts/build-money-db.mjs            # defaults to ~/Downloads/Customer Statement.xlsx
 *
 * Requires Node >=22.5 for the built-in node:sqlite module.
 *
 * The generated database is PRIVATE and gitignored. Do not deploy it.
 */

import { DatabaseSync } from "node:sqlite";
import readXlsxFile from "read-excel-file/node";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.env.MONEY_PROJECT_ROOT || path.resolve(import.meta.dirname, "..");
const SRC =
  process.argv[2] || path.join(os.homedir(), "Downloads", "Customer Statement.xlsx");
const OUT_DIR = path.join(ROOT, "data");
const OUT = path.join(OUT_DIR, "money.db");

/* ------------------------------------------------------------------ helpers */

/** "₦1,234.56" | "(₦5.00)" -> integer kobo. Empty/blank -> 0. */
function toKobo(value) {
  if (value === null || value === undefined) return 0;
  let s = String(value).trim();
  if (s === "" || s === "None") return 0;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[₦,\s()]/g, "");
  if (s === "") return 0;
  if (s.startsWith("-")) return -toKobo(s.slice(1));
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Unparseable amount: ${JSON.stringify(value)}`);
  const kobo = Math.round(n * 100);
  return negative ? -kobo : kobo;
}

/** "18/08/21 21:57:36" -> { ts: "2021-08-18T21:57:36", ... } */
function parseTimestamp(raw) {
  const m = String(raw)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Unparseable date: ${JSON.stringify(raw)}`);
  const [, dd, mm, yy, hh, mi, ss] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const date = `${year}-${mm}-${dd}`;
  // UTC so day-of-week is not shifted by the machine's timezone
  const dow = new Date(`${date}T${hh}:${mi}:${ss}Z`).getUTCDay();
  return {
    ts: `${date}T${hh}:${mi}:${ss}`,
    date,
    year,
    month: Number(mm),
    ym: `${year}-${mm}`,
    dow,
    hour: Number(hh),
  };
}

/**
 * The bank packs the counterparty as "Name/AccountNumber/Bank".
 * Some rows carry a gateway suffix, e.g. "Akinkunmi Oyewole*Flw/7811...".
 */
function parseCounterparty(raw) {
  if (raw === null || raw === undefined) return { name: null, account: null, bank: null };
  const s = String(raw).trim();
  if (s === "" || s === "None") return { name: null, account: null, bank: null };
  const [first = "", second = "", ...rest] = s.split("/");
  const tidy = (v) => {
    const out = String(v).replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
    return out === "" ? null : out;
  };
  return {
    name: tidy(first.split("*")[0]),
    account: tidy(second),
    bank: tidy(rest.join("/")),
  };
}

const tidyText = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || s === "None" ? null : s;
};

/* --------------------------------------------------------------------- read */

if (!fs.existsSync(SRC)) {
  console.error(`Statement not found: ${SRC}`);
  process.exit(1);
}

console.log(`Reading  ${SRC}`);
const workbook = await readXlsxFile(SRC);
const grid = workbook[0]?.data;
if (!grid) throw new Error("The workbook does not contain a readable worksheet");

// Locate the transaction header row rather than hardcoding its index, so the
// script survives the bank tweaking the number of preamble rows.
const headerIndex = grid.findIndex((row) =>
  row.some((cell) => String(cell).trim().toLowerCase() === "date/time"),
);
if (headerIndex === -1) throw new Error("Could not find the 'Date/Time' header row");

const header = grid[headerIndex].map((c) => String(c).trim().toLowerCase());
const col = (label) => {
  const i = header.indexOf(label);
  if (i === -1) throw new Error(`Missing expected column: ${label}`);
  return i;
};
const C = {
  ts: col("date/time"),
  in: col("money in"),
  out: col("money out"),
  category: col("category"),
  counterparty: col("to / from"),
  description: col("description"),
  balance: col("balance"),
};

// Account metadata from the preamble block. The bank lays it out as a grid of
// label cells with the value in the cell directly beneath, so look downward in
// the same column rather than flattening the rows.
const preamble = grid.slice(0, headerIndex);
const cell = (r, c) => String(preamble[r]?.[c] ?? "").trim();
const norm = (s) => s.toLowerCase().replace(/[\s:]/g, "");

const after = (label) => {
  for (let r = 0; r < preamble.length; r++) {
    for (let c = 0; c < (preamble[r]?.length ?? 0); c++) {
      if (norm(cell(r, c)) !== norm(label)) continue;
      for (let d = 1; d <= 3 && r + d < preamble.length; d++) {
        const v = cell(r + d, c);
        if (v !== "") return v;
      }
      return null;
    }
  }
  return null;
};

const accountName =
  preamble.flat().map((c) => String(c).trim()).find((c) => /^[A-Z][A-Z' -]{6,}$/.test(c)) ?? null;

const rows = [];
for (let r = headerIndex + 1; r < grid.length; r++) {
  const row = grid[r];
  const rawTs = row[C.ts];
  if (!rawTs || String(rawTs).trim() === "") continue;

  const t = parseTimestamp(rawTs);
  const moneyIn = toKobo(row[C.in]);
  const moneyOut = toKobo(row[C.out]);
  const cp = parseCounterparty(row[C.counterparty]);

  rows.push({
    seq: rows.length + 1,
    ...t,
    money_in: moneyIn,
    money_out: moneyOut,
    amount: moneyIn - moneyOut,
    direction: moneyIn > 0 ? "in" : "out",
    category: tidyText(row[C.category])?.toLowerCase() ?? "uncategorised",
    counterparty: cp.name,
    counterparty_account: cp.account,
    counterparty_bank: cp.bank,
    description: tidyText(row[C.description])?.toLowerCase() ?? null,
    balance_reported: toKobo(row[C.balance]),
  });
}

if (rows.length === 0) throw new Error("No transaction rows parsed");

// Derived running balance. The bank's own Balance column is unreliable: rows
// sharing a timestamp come back in arbitrary order, so it disagrees with itself
// in ~1.2k places. cumsum(money_in - money_out) reconciles exactly with the
// statement's stated closing balance, so we treat it as the source of truth.
let acc = 0;
for (const row of rows) {
  acc += row.amount;
  row.balance_running = acc;
}

/* -------------------------------------------------------------------- write */

fs.mkdirSync(OUT_DIR, { recursive: true });

// Build into a scratch file on local disk, then move it into place. Writing
// SQLite directly onto a synced/network folder can fail with disk I/O errors.
const TMP = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "money-db-")), "money.db");

const db = new DatabaseSync(TMP);
db.exec(`
  CREATE TABLE transactions (
    id                   INTEGER PRIMARY KEY,
    seq                  INTEGER NOT NULL,   -- original row order in the export
    ts                   TEXT    NOT NULL,   -- ISO 8601, local time as printed
    date                 TEXT    NOT NULL,   -- YYYY-MM-DD
    year                 INTEGER NOT NULL,
    month                INTEGER NOT NULL,   -- 1-12
    ym                   TEXT    NOT NULL,   -- YYYY-MM
    dow                  INTEGER NOT NULL,   -- 0 = Sunday
    hour                 INTEGER NOT NULL,
    money_in             INTEGER NOT NULL,   -- kobo
    money_out            INTEGER NOT NULL,   -- kobo
    amount               INTEGER NOT NULL,   -- kobo, signed (in - out)
    direction            TEXT    NOT NULL CHECK (direction IN ('in','out')),
    category             TEXT    NOT NULL,
    counterparty         TEXT,
    counterparty_account TEXT,
    counterparty_bank    TEXT,
    description          TEXT,
    balance_reported     INTEGER NOT NULL,   -- as printed by the bank
    balance_running      INTEGER NOT NULL    -- derived cumulative sum
  );

  CREATE INDEX idx_tx_ts           ON transactions (ts);
  CREATE INDEX idx_tx_ym           ON transactions (ym);
  CREATE INDEX idx_tx_date         ON transactions (date);
  CREATE INDEX idx_tx_category     ON transactions (category, direction);
  CREATE INDEX idx_tx_direction    ON transactions (direction);
  CREATE INDEX idx_tx_counterparty ON transactions (counterparty);
  CREATE INDEX idx_tx_amount       ON transactions (amount);

  -- Full-text search over the free-text fields.
  CREATE VIRTUAL TABLE transactions_fts USING fts5 (
    description, counterparty, category,
    content = 'transactions', content_rowid = 'id'
  );

  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
`);

const insert = db.prepare(`
  INSERT INTO transactions (
    seq, ts, date, year, month, ym, dow, hour,
    money_in, money_out, amount, direction, category,
    counterparty, counterparty_account, counterparty_bank,
    description, balance_reported, balance_running
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

db.exec("BEGIN");
for (const r of rows) {
  insert.run(
    r.seq, r.ts, r.date, r.year, r.month, r.ym, r.dow, r.hour,
    r.money_in, r.money_out, r.amount, r.direction, r.category,
    r.counterparty, r.counterparty_account, r.counterparty_bank,
    r.description, r.balance_reported, r.balance_running,
  );
}
db.exec("COMMIT");
db.exec(`
  INSERT INTO transactions_fts (rowid, description, counterparty, category)
  SELECT id, description, counterparty, category FROM transactions;
`);

const totalIn = rows.reduce((a, r) => a + r.money_in, 0);
const totalOut = rows.reduce((a, r) => a + r.money_out, 0);

const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
const metaRows = {
  account_name: accountName,
  account_number: after("Account"),
  statement_period: after("Date"),
  stated_opening_balance: after("Opening Balance"),
  stated_closing_balance: after("ClosingBalance"),
  stated_money_in: after("Money In"),
  stated_money_out: after("Money Out"),
  computed_money_in_kobo: String(totalIn),
  computed_money_out_kobo: String(totalOut),
  computed_closing_kobo: String(totalIn - totalOut),
  transaction_count: String(rows.length),
  first_transaction: rows[0].ts,
  last_transaction: rows[rows.length - 1].ts,
  source_file: path.basename(SRC),
  generated_at: new Date().toISOString(),
};
for (const [k, v] of Object.entries(metaRows)) if (v != null) setMeta.run(k, String(v));

db.exec("PRAGMA optimize");
db.exec("VACUUM");
db.close();

for (const stale of [`${OUT}-journal`, `${OUT}-wal`, `${OUT}-shm`]) {
  try {
    fs.rmSync(stale, { force: true });
  } catch {
    /* best effort: leftover sidecar files are harmless */
  }
}
fs.copyFileSync(TMP, OUT); // overwrites in place
fs.rmSync(path.dirname(TMP), { recursive: true, force: true });

/* ------------------------------------------------------------ reconciliation */

const naira = (kobo) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statedIn = toKobo(metaRows.stated_money_in);
const statedOut = toKobo(metaRows.stated_money_out);
const statedClose = toKobo(metaRows.stated_closing_balance);

console.log(`\nWrote    ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(`         ${rows.length} transactions, ${rows[0].date} -> ${rows.at(-1).date}\n`);
console.log("Reconciliation against the statement's own summary");
const check = (label, computed, stated) => {
  const ok = computed === stated;
  console.log(
    `  ${ok ? "OK  " : "DIFF"} ${label.padEnd(16)} computed ${naira(computed).padStart(18)}` +
      `   stated ${naira(stated).padStart(18)}` +
      (ok ? "" : `   delta ${naira(computed - stated)}`),
  );
  return ok;
};
const a = check("money in", totalIn, statedIn);
const b = check("money out", totalOut, statedOut);
const c = check("closing balance", totalIn - totalOut, statedClose);
if (!(a && b && c)) {
  console.error("\nReconciliation failed - do not trust this database.");
  process.exit(1);
}
console.log("\nAll totals reconcile.");
