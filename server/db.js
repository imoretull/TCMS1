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
  // Order matters: bring an existing (older) test_cases table up to date with
  // any new COLUMNS *before* applying schema.sql, because schema.sql creates an
  // index on a newer column (idx_tc_category) which would otherwise fail with
  // "no such column" on a pre-upgrade database. On a brand-new database
  // test_cases doesn't exist yet, so addMissingColumns is a no-op and schema.sql
  // creates everything from scratch.
  addMissingColumns();
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);
}

/**
 * Lightweight forward-migration for databases created by an older schema
 * version. `schema.sql` uses CREATE TABLE IF NOT EXISTS, which adds new tables
 * (e.g. `categories`) but cannot add new COLUMNS to an existing table. Here we
 * add any columns introduced in later versions if they are missing, so an
 * existing v1 file is upgraded in place without data loss. No-op when the
 * test_cases table doesn't exist yet (fresh database).
 */
function addMissingColumns() {
  const info = db.prepare(`PRAGMA table_info(test_cases)`).all();
  if (info.length === 0) return; // fresh DB — schema.sql will create the table
  const cols = new Set(info.map((c) => c.name));
  const additions = [
    ['category', `ALTER TABLE test_cases ADD COLUMN category TEXT`],
    [
      'test_nature',
      `ALTER TABLE test_cases ADD COLUMN test_nature TEXT NOT NULL DEFAULT 'Positive'`,
    ],
    [
      'is_new_functionality',
      `ALTER TABLE test_cases ADD COLUMN is_new_functionality INTEGER NOT NULL DEFAULT 0`,
    ],
    ['sprint', `ALTER TABLE test_cases ADD COLUMN sprint TEXT`],
  ];
  for (const [name, sql] of additions) {
    if (!cols.has(name)) db.exec(sql);
  }
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
