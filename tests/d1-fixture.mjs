import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first(column) {
          const row = sqlite.prepare(sql).get(...values);
          return row ? (column ? row[column] : { ...row }) : null;
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...values).map(row => ({ ...row })) };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
      };
      return statement;
    },
  };
}

export function createTestEnv(db) {
  return {
    DB: db,
    AUTH_SECRET: 'test-auth-secret-for-unit-tests-only',
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    NOW_PLAYING_TOKEN: 'now-playing-test-token',
    WEBSITE_ORIGIN: 'https://akinkunmi.dev',
    CORS_ORIGINS: 'https://akinkunmi.dev,https://music.youtube.com',
  };
}
