/** Applies committed migrations to the local database. */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.WORKBENCH_DB ?? resolve(process.cwd(), 'data/workbench.db');
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = ON');
migrate(drizzle(sqlite), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
sqlite.close();

console.log(`migrations applied -> ${dbPath}`);
