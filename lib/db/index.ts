/**
 * Database handle. Single-user, local file, synchronous driver — there is no
 * connection pool to manage and no network to fail.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

const DB_PATH = process.env.WORKBENCH_DB ?? resolve(process.cwd(), 'data/workbench.db');

function createClient() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

// Next.js dev-mode hot reload re-evaluates modules; reuse the handle so we do
// not open a new file descriptor on every edit.
const globalForDb = globalThis as unknown as {
  __workbenchSqlite?: ReturnType<typeof createClient>;
};

const sqlite = globalForDb.__workbenchSqlite ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForDb.__workbenchSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
