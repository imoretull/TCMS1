import db from './db.js';
import {
  STATUSES,
  PRIORITIES,
  TYPES,
  TEST_NATURES,
  DEFAULT_STATUS,
  DEFAULT_PRIORITY,
  DEFAULT_TYPE,
  DEFAULT_TEST_NATURE,
} from './constants.js';

/** Error thrown when an update is rejected because the record changed. */
export class ConflictError extends Error {
  constructor(current) {
    super('This test case was changed by someone else since you opened it.');
    this.name = 'ConflictError';
    this.current = current;
  }
}

/** Error thrown for invalid input. Carries a 400-friendly message. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function nowIso() {
  return new Date().toISOString();
}

/** Map a DB row to the API shape (camelCase, real boolean for pinned). */
function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    tcId: row.tc_id,
    title: row.title,
    area: row.area,
    category: row.category,
    status: row.status,
    priority: row.priority,
    assigneeEmail: row.assignee_email,
    type: row.type,
    testNature: row.test_nature,
    preconditions: row.preconditions,
    testData: row.test_data,
    testSteps: row.test_steps,
    expectedResult: row.expected_result,
    comments: row.comments,
    pinned: !!row.pinned,
    isNewFunctionality: !!row.is_new_functionality,
    sprint: row.sprint,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Generate the next human-readable TC ID (TC-1001, TC-1002, ...). */
function nextTcId() {
  const row = db
    .prepare(`UPDATE counters SET value = value + 1 WHERE name = 'tc_id' RETURNING value`)
    .get();
  return `TC-${row.value}`;
}

function ensureArea(area) {
  const trimmed = (area || '').trim();
  if (!trimmed) return null;
  db.prepare(`INSERT OR IGNORE INTO areas (name) VALUES (?)`).run(trimmed);
  return trimmed;
}

/**
 * Register a category under its parent area (the Area → Category hierarchy).
 * A category only makes sense paired with an area, so we ignore a category
 * when no area is present. Returns the trimmed category (or null).
 */
function ensureCategory(area, category) {
  const trimmedCat = (category || '').trim();
  if (!trimmedCat) return null;
  const trimmedArea = (area || '').trim();
  if (!trimmedArea) return null; // category without an area is invalid
  db.prepare(
    `INSERT OR IGNORE INTO categories (area, name) VALUES (?, ?)`
  ).run(trimmedArea, trimmedCat);
  return trimmedCat;
}

/** Register an optional sprint tag so the filter can offer known values. */
function ensureSprint(sprint) {
  const trimmed = (sprint || '').trim();
  if (!trimmed) return null;
  db.prepare(`INSERT OR IGNORE INTO sprints (name) VALUES (?)`).run(trimmed);
  return trimmed;
}

function validateEnums({ status, priority, type, testNature }) {
  if (status && !STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status: ${status}`);
  }
  if (priority && !PRIORITIES.includes(priority)) {
    throw new ValidationError(`Invalid priority: ${priority}`);
  }
  if (type && !TYPES.includes(type)) {
    throw new ValidationError(`Invalid type: ${type}`);
  }
  if (testNature && !TEST_NATURES.includes(testNature)) {
    throw new ValidationError(`Invalid test nature: ${testNature}`);
  }
}

export function listTestCases() {
  // Pinned first, then most recently updated. Filtering/sorting beyond this
  // is done client-side for snappy UX at the expected scale.
  const rows = db
    .prepare(
      `SELECT * FROM test_cases ORDER BY pinned DESC, datetime(updated_at) DESC`
    )
    .all();
  return rows.map(rowToApi);
}

export function getTestCase(id) {
  const row = db.prepare(`SELECT * FROM test_cases WHERE id = ?`).get(id);
  return rowToApi(row);
}

export function createTestCase(input, user) {
  if (!input.title || !input.title.trim()) {
    throw new ValidationError('Title is required.');
  }
  validateEnums(input);

  const now = nowIso();
  const area = ensureArea(input.area);
  const category = ensureCategory(area, input.category);
  const sprint = ensureSprint(input.sprint);
  const tcId = nextTcId();

  const info = db
    .prepare(
      `INSERT INTO test_cases (
        tc_id, title, area, category, status, priority, assignee_email, type, test_nature,
        preconditions, test_data, test_steps, expected_result, comments, pinned,
        is_new_functionality, sprint,
        created_at, created_by, updated_at, updated_by
      ) VALUES (
        @tc_id, @title, @area, @category, @status, @priority, @assignee_email, @type, @test_nature,
        @preconditions, @test_data, @test_steps, @expected_result, @comments, @pinned,
        @is_new_functionality, @sprint,
        @created_at, @created_by, @updated_at, @updated_by
      )`
    )
    .run({
      tc_id: tcId,
      title: input.title.trim(),
      area,
      category,
      status: input.status || DEFAULT_STATUS,
      priority: input.priority || DEFAULT_PRIORITY,
      assignee_email: input.assigneeEmail || null,
      type: input.type || DEFAULT_TYPE,
      test_nature: input.testNature || DEFAULT_TEST_NATURE,
      is_new_functionality: input.isNewFunctionality ? 1 : 0,
      sprint,
      preconditions: input.preconditions || '',
      test_data: input.testData || '',
      test_steps: input.testSteps || '',
      expected_result: input.expectedResult || '',
      comments: input.comments || '',
      pinned: input.pinned ? 1 : 0,
      created_at: now,
      created_by: user.email,
      updated_at: now,
      updated_by: user.email,
    });

  return getTestCase(info.lastInsertRowid);
}

/**
 * Update a test case with optimistic locking. The caller must pass the
 * `updatedAt` they last saw; if it no longer matches, we throw ConflictError
 * carrying the current record so the UI can show "changed since you opened it".
 */
export function updateTestCase(id, input, user) {
  const existing = db.prepare(`SELECT * FROM test_cases WHERE id = ?`).get(id);
  if (!existing) return null;

  if (!input.updatedAt) {
    throw new ValidationError('Missing updatedAt for conflict detection.');
  }
  if (input.updatedAt !== existing.updated_at) {
    throw new ConflictError(rowToApi(existing));
  }

  if (input.title !== undefined && !String(input.title).trim()) {
    throw new ValidationError('Title cannot be empty.');
  }
  validateEnums(input);

  const area =
    input.area !== undefined ? ensureArea(input.area) : existing.area;
  // Resolve category against the (possibly new) area. If the area changed but
  // the caller didn't send a category, drop the stale category rather than
  // leaving one that belongs to the old area.
  let category;
  if (input.category !== undefined) {
    category = ensureCategory(area, input.category);
  } else if (input.area !== undefined && area !== existing.area) {
    category = null;
  } else {
    category = existing.category;
  }
  const now = nowIso();

  // Coalesce: only overwrite fields the caller actually provided.
  const next = {
    title: input.title !== undefined ? String(input.title).trim() : existing.title,
    area,
    category,
    status: input.status ?? existing.status,
    priority: input.priority ?? existing.priority,
    assignee_email:
      input.assigneeEmail !== undefined
        ? input.assigneeEmail || null
        : existing.assignee_email,
    type: input.type ?? existing.type,
    test_nature: input.testNature ?? existing.test_nature,
    preconditions: input.preconditions ?? existing.preconditions,
    test_data: input.testData ?? existing.test_data,
    test_steps: input.testSteps ?? existing.test_steps,
    expected_result: input.expectedResult ?? existing.expected_result,
    comments: input.comments ?? existing.comments,
    pinned:
      input.pinned !== undefined ? (input.pinned ? 1 : 0) : existing.pinned,
    is_new_functionality:
      input.isNewFunctionality !== undefined
        ? input.isNewFunctionality
          ? 1
          : 0
        : existing.is_new_functionality,
    sprint:
      input.sprint !== undefined
        ? ensureSprint(input.sprint)
        : existing.sprint,
    updated_at: now,
    updated_by: user.email,
    id,
  };

  db.prepare(
    `UPDATE test_cases SET
      title = @title, area = @area, category = @category,
      status = @status, priority = @priority,
      assignee_email = @assignee_email, type = @type, test_nature = @test_nature,
      preconditions = @preconditions, test_data = @test_data,
      test_steps = @test_steps, expected_result = @expected_result,
      comments = @comments, pinned = @pinned,
      is_new_functionality = @is_new_functionality, sprint = @sprint,
      updated_at = @updated_at, updated_by = @updated_by
    WHERE id = @id`
  ).run(next);

  return getTestCase(id);
}

/**
 * Toggle the pinned flag. This is a lightweight, low-conflict action so it
 * intentionally does NOT require optimistic locking — pinning is team-wide
 * awareness, not content editing.
 */
export function setPinned(id, pinned, user) {
  const info = db
    .prepare(
      `UPDATE test_cases SET pinned = ?, updated_at = ?, updated_by = ? WHERE id = ?`
    )
    .run(pinned ? 1 : 0, nowIso(), user.email, id);
  if (info.changes === 0) return null;
  return getTestCase(id);
}

export function deleteTestCase(id) {
  const info = db.prepare(`DELETE FROM test_cases WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function listAreas() {
  return db
    .prepare(`SELECT name FROM areas ORDER BY name COLLATE NOCASE`)
    .all()
    .map((r) => r.name);
}

/**
 * Return categories grouped by their parent area, e.g.
 *   { Checkout: ['Discount', 'Shipping'], Cart: ['Quantity'] }
 * so the UI can show area-scoped category choices.
 */
export function listCategoriesByArea() {
  const rows = db
    .prepare(
      `SELECT area, name FROM categories ORDER BY area COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all();
  const byArea = {};
  for (const { area, name } of rows) {
    (byArea[area] ||= []).push(name);
  }
  return byArea;
}

/** Known sprint tags, for the filter dropdown. */
export function listSprints() {
  return db
    .prepare(`SELECT name FROM sprints ORDER BY name COLLATE NOCASE`)
    .all()
    .map((r) => r.name);
}

export function listUsers() {
  return db
    .prepare(`SELECT email, name FROM users ORDER BY name COLLATE NOCASE`)
    .all();
}
