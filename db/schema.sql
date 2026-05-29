-- ============================================================================
-- TCMS — canonical database schema (SQLite)
--
-- This file is the SINGLE SOURCE OF TRUTH for the database structure. The
-- application loads it on startup; any other application can apply it to
-- create a compatible, empty TCMS database with no dependency on the Node app:
--
--     sqlite3 tcms.db < db/schema.sql
--
-- IMPORTANT — separation of data and logic:
--   This file defines STRUCTURE only (tables, columns, defaults, indexes).
--   The business RULES (TC-ID generation, updated_at stamping, optimistic
--   edit-locking, enum validation, area auto-creation) live in the APPLICATION
--   layer, NOT in the database. The database is intentionally a passive,
--   portable data store. Any application that writes to this database MUST
--   follow the rules documented in db/SCHEMA.md so the data stays consistent
--   across every app and every machine that uses the file.
--
--   The enum value sets below are written as comments (not CHECK constraints)
--   on purpose: they are part of the contract enforced by the application, and
--   are deliberately extensible without a schema migration.
-- ============================================================================

-- ── Recommended connection pragmas (set by each connecting app) ─────────────
-- PRAGMA journal_mode = WAL;     -- better concurrent read/write on one machine
-- PRAGMA foreign_keys = ON;      -- enforce the FK relationships below

-- ── Schema version ───────────────────────────────────────────────────────--
-- Lets another application detect whether it understands this database's
-- layout before reading/writing. Bump SCHEMA_VERSION in db/SCHEMA.md and here
-- together whenever the structure changes incompatibly.
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '4');

-- ── QA users ───────────────────────────────────────────────────────────────
-- The authoritative user list is defined in the application's .env
-- (TCMS_USERS) and synced into this table on startup. Rows are kept even if a
-- user is later removed from .env, so historical attribution is preserved.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,   -- lowercase email; stable identity for attribution
  name  TEXT NOT NULL       -- display name
);

-- ── Areas ───────────────────────────────────────────────────────────────────
-- User-managed functional areas (Cart, Checkout, ...). The application inserts
-- a new area on the fly when a test case references one that does not exist.
CREATE TABLE IF NOT EXISTS areas (
  name TEXT PRIMARY KEY
);

-- ── Categories ──────────────────────────────────────────────────────────────
-- A category is a sub-grouping WITHIN an area: Area -> Category is a
-- parent/child hierarchy (e.g. Checkout -> Discount, Checkout -> Shipping).
-- User-managed: the application inserts a new (area, name) pair on the fly when
-- a test case references one that does not exist. The same category name may
-- exist under different areas, so the primary key is the pair.
CREATE TABLE IF NOT EXISTS categories (
  area TEXT NOT NULL,   -- parent area (references areas.name, soft)
  name TEXT NOT NULL,   -- category name within that area
  PRIMARY KEY (area, name)
);

-- ── Sprints ─────────────────────────────────────────────────────────────────
-- Optional, user-managed sprint tags (e.g. 'S21', 'S22', 'S23'). The
-- application registers a new sprint on the fly when a test case references one,
-- so the filter can offer known sprint values.
CREATE TABLE IF NOT EXISTS sprints (
  name TEXT PRIMARY KEY
);

-- ── Counters ────────────────────────────────────────────────────────────────
-- Backs the human-readable TC-ID sequence. The application atomically does
--   UPDATE counters SET value = value + 1 WHERE name='tc_id' RETURNING value;
-- and formats the result as 'TC-<value>'. Seeded at 1000 so the first case is
-- TC-1001.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT    PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('tc_id', 1000);

-- ── Test cases (the core entity) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_cases (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,  -- internal surrogate key
  tc_id            TEXT    NOT NULL UNIQUE,            -- public id, e.g. 'TC-1001'
  title            TEXT    NOT NULL,                   -- must be non-empty (app-enforced)
  area             TEXT,                               -- references areas.name (soft)
  category         TEXT,                               -- sub-group within area; (area,category) -> categories (soft)

  -- This table is a REPOSITORY of test-case definitions (TestRail-style).
  -- Execution data (pass/fail status, who ran it, run-time priority) lives in a
  -- future Test Runs feature, NOT here. So there is no status/assignee/priority.

  -- Execution method. Enum (app-enforced). Allowed: Manual | Automated.
  -- (Labeled "Execution" in the UI.)
  type             TEXT    NOT NULL DEFAULT 'Manual',

  -- Test level / suite. Enum (app-enforced). Allowed: Sanity | Smoke | Regression.
  -- These NEST: Sanity ⊆ Smoke ⊆ Regression. A case is tagged with the
  -- narrowest level it belongs to; inclusive filtering is applied by the app
  -- (filtering Regression shows all, Smoke shows Smoke+Sanity, Sanity only
  -- Sanity). (Labeled "Type" in the UI.)
  test_level       TEXT    NOT NULL DEFAULT 'Regression',

  -- Enum (app-enforced). Allowed: Positive | Negative
  -- Positive = verifies correct behavior with valid input/conditions.
  -- Negative = verifies graceful handling of invalid input/error conditions.
  test_nature      TEXT    NOT NULL DEFAULT 'Positive',

  preconditions    TEXT    DEFAULT '',
  test_data        TEXT    DEFAULT '',
  test_steps       TEXT    DEFAULT '',
  expected_result  TEXT    DEFAULT '',
  comments         TEXT    DEFAULT '',

  pinned           INTEGER NOT NULL DEFAULT 0,         -- 0 = false, 1 = true

  -- Optional tags for filtering.
  is_new_functionality INTEGER NOT NULL DEFAULT 0,     -- 0/1: covers newly built functionality
  sprint           TEXT,                               -- e.g. 'S23'; references sprints.name (soft)

  -- Audit + concurrency control. Timestamps are ISO-8601 UTC strings, e.g.
  -- '2026-05-29T15:07:39.455Z'. updated_at drives optimistic edit-locking:
  -- an updating app must verify the updated_at it last read still matches
  -- before writing (see db/SCHEMA.md). All four are set by the application.
  created_at       TEXT    NOT NULL,
  created_by       TEXT,                               -- users.email of creator
  updated_at       TEXT    NOT NULL,
  updated_by       TEXT                                -- users.email of last editor
);

-- Indexes supporting the common filter columns.
CREATE INDEX IF NOT EXISTS idx_tc_area     ON test_cases(area);
CREATE INDEX IF NOT EXISTS idx_tc_category ON test_cases(category);
CREATE INDEX IF NOT EXISTS idx_tc_level    ON test_cases(test_level);
CREATE INDEX IF NOT EXISTS idx_tc_sprint   ON test_cases(sprint);
