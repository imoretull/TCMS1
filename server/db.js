import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_FILE, USERS } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The canonical, standalone schema. This file (db/schema.sql) is the single
// source of truth for the database structure and can be applied by any tool
// (`sqlite3 tcms.db < db/schema.sql`) — see db/SCHEMA.md for the full data
// contract that every writer must follow.
const SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');

// Ensure the data directory exists before opening the DB file.
fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });

// node:sqlite (built into Node 22+) — no native build step, runs anywhere
// Node runs. WAL improves concurrency for simultaneous readers/writers.
const db = new DatabaseSync(DATABASE_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Apply the canonical schema. It uses CREATE TABLE IF NOT EXISTS / INSERT OR
 * IGNORE throughout, so it is safe to run on every startup (no-op if the
 * database is already initialized).
 */
function migrate() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);
}

/**
 * Upsert the configured QA users from .env into the DB on every startup.
 * This keeps the user list in sync with the single source of truth (.env)
 * without requiring a migration. Removed users stay in the DB so historical
 * attribution (created_by / assignee) is preserved.
 */
function syncUsers() {
  const upsert = db.prepare(`
    INSERT INTO users (email, name) VALUES (@email, @name)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name
  `);
  transaction(() => {
    for (const u of USERS) upsert.run({ email: u.email, name: u.name });
  });
}

/**
 * Run `fn` inside a transaction. node:sqlite has no built-in transaction
 * wrapper (unlike better-sqlite3), so we manage BEGIN/COMMIT/ROLLBACK here.
 * Returns whatever `fn` returns.
 */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

migrate();
syncUsers();

export default db;
