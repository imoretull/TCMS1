import db, { transaction } from './db.js';
import {
  TYPES,
  TEST_NATURES,
  TEST_LEVELS,
  LAYERS,
  HTTP_METHODS,
  DEFAULT_TYPE,
  DEFAULT_TEST_NATURE,
  DEFAULT_TEST_LEVEL,
  DEFAULT_LAYER,
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
    type: row.type,
    testNature: row.test_nature,
    testLevel: row.test_level,
    layer: row.layer,
    endpoint: row.endpoint,
    httpMethod: row.http_method,
    requestBody: row.request_body,
    expectedStatus: row.expected_status,
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

/**
 * Resolve the API-only fields for a given layer. For a UI test these are forced
 * blank so a case never carries stale API details; for an API test we take the
 * provided values (defaulting to '').
 */
function apiFieldsFor(layer, input, existing = {}) {
  if (layer !== 'API') {
    return { endpoint: '', http_method: '', request_body: '', expected_status: '' };
  }
  const pick = (k, col) =>
    input[k] !== undefined ? input[k] || '' : existing[col] ?? '';
  return {
    endpoint: pick('endpoint', 'endpoint'),
    http_method: pick('httpMethod', 'http_method'),
    request_body: pick('requestBody', 'request_body'),
    expected_status: pick('expectedStatus', 'expected_status'),
  };
}

/** Register an optional sprint tag so the filter can offer known values. */
function ensureSprint(sprint) {
  const trimmed = (sprint || '').trim();
  if (!trimmed) return null;
  db.prepare(`INSERT OR IGNORE INTO sprints (name) VALUES (?)`).run(trimmed);
  return trimmed;
}

function validateEnums({ type, testNature, testLevel, layer, httpMethod }) {
  if (type && !TYPES.includes(type)) {
    throw new ValidationError(`Invalid execution type: ${type}`);
  }
  if (testNature && !TEST_NATURES.includes(testNature)) {
    throw new ValidationError(`Invalid test nature: ${testNature}`);
  }
  if (testLevel && !TEST_LEVELS.includes(testLevel)) {
    throw new ValidationError(`Invalid test level: ${testLevel}`);
  }
  // Layer is required to be exactly one of UI/API. We accept undefined here
  // (create applies the default; update leaves it unchanged) but reject any
  // explicit value that isn't a known layer — including empty string.
  if (layer !== undefined && !LAYERS.includes(layer)) {
    throw new ValidationError(`Layer must be one of ${LAYERS.join(' or ')}.`);
  }
  if (httpMethod && !HTTP_METHODS.includes(httpMethod)) {
    throw new ValidationError(`Invalid HTTP method: ${httpMethod}`);
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
  const layer = input.layer || DEFAULT_LAYER;
  const api = apiFieldsFor(layer, input);
  const tcId = nextTcId();

  const info = db
    .prepare(
      `INSERT INTO test_cases (
        tc_id, title, area, category, type, test_nature, test_level,
        layer, endpoint, http_method, request_body, expected_status,
        preconditions, test_data, test_steps, expected_result, comments, pinned,
        is_new_functionality, sprint,
        created_at, created_by, updated_at, updated_by
      ) VALUES (
        @tc_id, @title, @area, @category, @type, @test_nature, @test_level,
        @layer, @endpoint, @http_method, @request_body, @expected_status,
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
      type: input.type || DEFAULT_TYPE,
      test_nature: input.testNature || DEFAULT_TEST_NATURE,
      test_level: input.testLevel || DEFAULT_TEST_LEVEL,
      layer,
      ...api,
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
  // Resolve layer + API fields. If the layer flips to UI, API fields are
  // cleared; if API, take provided values (or keep existing).
  const layer = input.layer ?? existing.layer;
  const api = apiFieldsFor(layer, input, existing);
  const now = nowIso();

  // Coalesce: only overwrite fields the caller actually provided.
  const next = {
    title: input.title !== undefined ? String(input.title).trim() : existing.title,
    area,
    category,
    type: input.type ?? existing.type,
    test_nature: input.testNature ?? existing.test_nature,
    test_level: input.testLevel ?? existing.test_level,
    layer,
    ...api,
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
      type = @type, test_nature = @test_nature, test_level = @test_level,
      layer = @layer, endpoint = @endpoint, http_method = @http_method,
      request_body = @request_body, expected_status = @expected_status,
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

/**
 * Duplicate a test case into a brand-new one (fresh TC-ID, "(copy)" suffix on
 * the title). All content fields are copied; pinned is reset to false so the
 * copy doesn't unexpectedly surface at the top. Returns the new case, or null
 * if the source doesn't exist.
 */
export function duplicateTestCase(id, user) {
  const src = getTestCase(id);
  if (!src) return null;
  return createTestCase(
    {
      title: `${src.title} (copy)`,
      area: src.area,
      category: src.category,
      type: src.type,
      testNature: src.testNature,
      testLevel: src.testLevel,
      layer: src.layer,
      endpoint: src.endpoint,
      httpMethod: src.httpMethod,
      requestBody: src.requestBody,
      expectedStatus: src.expectedStatus,
      preconditions: src.preconditions,
      testData: src.testData,
      testSteps: src.testSteps,
      expectedResult: src.expectedResult,
      comments: src.comments,
      sprint: src.sprint,
      isNewFunctionality: src.isNewFunctionality,
      pinned: false,
    },
    user
  );
}

/**
 * Bulk-update a set of cases with a partial patch (only the provided fields are
 * changed; others are left untouched). Bulk actions are an explicit,
 * deliberate operation over rows the user selected, so they intentionally
 * BYPASS per-row optimistic locking (see db/SCHEMA.md §4). Runs in one
 * transaction. Returns { updated }.
 *
 * Allowed patch fields: type (Execution), testNature, testLevel, layer, area,
 * category, sprint. Bulk-setting layer to UI also clears the API-only fields.
 */
export function bulkUpdateTestCases(ids, patch, user) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('No test cases selected.');
  }
  validateEnums(patch);

  // Resolve which columns to set from the patch.
  const sets = [];
  const params = {};

  if (patch.type !== undefined) {
    sets.push('type = @type');
    params.type = patch.type;
  }
  if (patch.testNature !== undefined) {
    sets.push('test_nature = @test_nature');
    params.test_nature = patch.testNature;
  }
  if (patch.testLevel !== undefined) {
    sets.push('test_level = @test_level');
    params.test_level = patch.testLevel;
  }
  if (patch.layer !== undefined) {
    sets.push('layer = @layer');
    params.layer = patch.layer;
    // Switching a batch to UI clears API-only fields for consistency.
    if (patch.layer === 'UI') {
      sets.push(
        'endpoint = @endpoint',
        'http_method = @http_method',
        'request_body = @request_body',
        'expected_status = @expected_status'
      );
      params.endpoint = '';
      params.http_method = '';
      params.request_body = '';
      params.expected_status = '';
    }
  }
  if (patch.area !== undefined) {
    const area = ensureArea(patch.area);
    sets.push('area = @area');
    params.area = area;
    // If area is set in bulk, also set (or clear) the category consistently.
    const category =
      patch.category !== undefined ? ensureCategory(area, patch.category) : null;
    sets.push('category = @category');
    params.category = category;
  } else if (patch.category !== undefined) {
    // Category without area change: only meaningful per existing row's area,
    // so we skip silently rather than risk orphaning. (UI sends area+category
    // together.)
  }
  if (patch.sprint !== undefined) {
    sets.push('sprint = @sprint');
    params.sprint = ensureSprint(patch.sprint);
  }

  if (sets.length === 0) {
    throw new ValidationError('Nothing to update — choose at least one field.');
  }

  sets.push('updated_at = @updated_at', 'updated_by = @updated_by');
  params.updated_at = nowIso();
  params.updated_by = user.email;

  const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
  ids.forEach((id, i) => {
    params[`id${i}`] = id;
  });

  const sql = `UPDATE test_cases SET ${sets.join(', ')} WHERE id IN (${placeholders})`;
  const info = transaction(() => db.prepare(sql).run(params));
  return { updated: info.changes };
}

/**
 * Bulk-delete a set of cases in one transaction. Returns { deleted }.
 */
export function bulkDeleteTestCases(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('No test cases selected.');
  }
  const placeholders = ids.map(() => '?').join(', ');
  const info = transaction(() =>
    db.prepare(`DELETE FROM test_cases WHERE id IN (${placeholders})`).run(...ids)
  );
  return { deleted: info.changes };
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
