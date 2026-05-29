import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DATABASE_FILE, DEFAULT_DATASET, USERS } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The canonical, standalone schema. This file (db/schema.sql) is the single
// source of truth for the database structure and can be applied by any tool
// (`sqlite3 tcms.db < db/schema.sql`) — see db/SCHEMA.md for the full data
// contract that every writer must follow.
const SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');
const SCHEMA_SQL = fs.readFileSync(SCHEMA_PATH, 'utf8');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Dataset switcher ─────────────────────────────────────────────────────────
// The app can serve different SQLite files ("datasets") that all share the same
// schema/contract — e.g. amazon.db, google.db. Because the data structure is
// identical, switching is plug-and-play: we just point the live connection at a
// different file (running migrate + user-sync against it) and route every query
// through getDb(). Switching is global (server-wide).

let current = null; // { name, file, db }

/** Turn a .db filename into a friendly dataset name (file stem). */
function datasetNameFromFile(file) {
  return path.basename(file, path.extname(file));
}

/** Resolve a safe absolute path for a dataset name, guarding against traversal. */
function fileForDataset(name) {
  // Only a bare name is allowed (no path separators), and it must resolve
  // inside DATA_DIR.
  if (!name || /[\\/]/.test(name) || name.includes('..')) {
    throw new Error(`Invalid dataset name: ${name}`);
  }
  const file = path.join(DATA_DIR, `${name}.db`);
  const rel = path.relative(DATA_DIR, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Dataset path escapes data dir: ${name}`);
  }
  return file;
}

/** List available datasets (every *.db in DATA_DIR), sorted by name. */
export function listDatasets() {
  const entries = fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.db'))
    .map((e) => datasetNameFromFile(e.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return entries;
}

/** The currently-active dataset name. */
export function getCurrentDataset() {
  return current?.name ?? null;
}

/** The live connection for the active dataset. All queries go through this. */
export function getDb() {
  if (!current) throw new Error('No dataset is open.');
  return current.db;
}

/** Open a dataset file: create/upgrade schema and sync users, then make live. */
function open(name) {
  const file = fileForDataset(name);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  syncUsers(db);
  current = { name, file, db };
  return current;
}

/**
 * Switch the active dataset to `name`. Closes the previous connection. Returns
 * the new current dataset name. Throws if the dataset file doesn't exist
 * (use openDataset to create a new one).
 */
export function switchDataset(name) {
  const file = fileForDataset(name);
  if (!fs.existsSync(file)) {
    throw new Error(`Dataset not found: ${name}`);
  }
  return openDataset(name);
}

/**
 * Make `name` the active dataset, creating its file if it doesn't exist yet.
 * Used by the seed tooling to provision new datasets.
 */
export function openDataset(name) {
  if (current?.name === name) return current.name; // already active
  const prev = current;
  open(name);
  if (prev?.db) {
    try {
      prev.db.close();
    } catch {
      /* ignore close errors */
    }
  }
  return current.name;
}

// ── Schema setup (runs against whichever connection is being opened) ──────────

/**
 * Apply the canonical schema to `db`. Safe to run on every open (uses CREATE
 * ... IF NOT EXISTS / INSERT OR IGNORE). Adds any columns introduced in later
 * schema versions BEFORE applying schema.sql, because schema.sql creates an
 * index on a newer column which would otherwise fail on a pre-upgrade file.
 */
function migrate(db) {
  addMissingColumns(db);
  db.exec(SCHEMA_SQL);
}

function addMissingColumns(db) {
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
 * Upsert the configured QA users from .env into `db`. Users are shared config
 * across all datasets (same QA team), so every dataset gets the same user list.
 * Removed users stay so historical attribution is preserved.
 */
function syncUsers(db) {
  const upsert = db.prepare(`
    INSERT INTO users (email, name) VALUES (@email, @name)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name
  `);
  transactionOn(db, () => {
    for (const u of USERS) upsert.run({ email: u.email, name: u.name });
  });
}

// ── Transactions ─────────────────────────────────────────────────────────────

/** Run `fn` in a transaction on a specific connection. */
export function transactionOn(db, fn) {
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

/** Run `fn` in a transaction on the current (live) dataset connection. */
export function transaction(fn) {
  return transactionOn(getDb(), fn);
}

// ── Startup: choose the initial dataset ──────────────────────────────────────

function pickInitialDataset() {
  const available = listDatasets();

  // 1) Honor DEFAULT_DATASET if present (case-insensitive).
  const wanted = DEFAULT_DATASET?.toLowerCase();
  const match = available.find((n) => n.toLowerCase() === wanted);
  if (match) return match;

  // 2) If nothing matches but the configured DATABASE_FILE exists, use its name
  //    (and ensure it lives in DATA_DIR so the switcher can see it).
  const dbName = datasetNameFromFile(DATABASE_FILE);
  if (available.includes(dbName)) return dbName;

  // 3) Otherwise the first available dataset.
  if (available.length > 0) return available[0];

  // 4) Nothing exists yet — create the default one so the app still runs.
  return DEFAULT_DATASET;
}

open(pickInitialDataset());

// Back-compat default export: a proxy that always forwards to the *current*
// connection, so existing `import db from './db.js'` call sites keep working
// even across switches. New code should prefer getDb().
const dbProxy = new Proxy(
  {},
  {
    get(_t, prop) {
      const value = getDb()[prop];
      return typeof value === 'function' ? value.bind(getDb()) : value;
    },
  }
);

export default dbProxy;
