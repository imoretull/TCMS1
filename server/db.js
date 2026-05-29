import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_FILE, USERS } from './config.js';

// Ensure the data directory exists before opening the DB file.
fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });

// node:sqlite (built into Node 22+) — no native build step, runs anywhere
// Node runs. WAL improves concurrency for simultaneous readers/writers.
const db = new DatabaseSync(DATABASE_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Create tables if they don't exist. Safe to run on every startup.
 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      name  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS areas (
      name TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tc_id            TEXT    NOT NULL UNIQUE,
      title            TEXT    NOT NULL,
      area             TEXT,
      status           TEXT    NOT NULL DEFAULT 'Skipped',
      priority         TEXT    NOT NULL DEFAULT 'Medium',
      assignee_email   TEXT,
      type             TEXT    NOT NULL DEFAULT 'Manual',
      preconditions    TEXT    DEFAULT '',
      test_data        TEXT    DEFAULT '',
      test_steps       TEXT    DEFAULT '',
      expected_result  TEXT    DEFAULT '',
      comments         TEXT    DEFAULT '',
      pinned           INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL,
      created_by       TEXT,
      updated_at       TEXT    NOT NULL,
      updated_by       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tc_area     ON test_cases(area);
    CREATE INDEX IF NOT EXISTS idx_tc_status   ON test_cases(status);
    CREATE INDEX IF NOT EXISTS idx_tc_priority ON test_cases(priority);
    CREATE INDEX IF NOT EXISTS idx_tc_assignee ON test_cases(assignee_email);

    -- Tracks the next sequence number for human-readable TC IDs (TC-1024, ...).
    CREATE TABLE IF NOT EXISTS counters (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
  `);

  // Seed the TC-ID counter once. We start at 1000 so the first case is TC-1001.
  db.prepare(
    `INSERT OR IGNORE INTO counters (name, value) VALUES ('tc_id', 1000)`
  ).run();
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
