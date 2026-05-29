# TCMS Database Contract

**Schema version: 3**

This document is the **contract** for the TCMS database. The TCMS web app is the
*reference implementation* of these rules, but the database file is standalone:
**any application, in any language, on any machine, may open the SQLite file and
read or write it** — as long as it follows the rules below.

The guiding principle is **separation of data from logic**:

- The **data** is portable and self-contained: a single SQLite file
  (`data/tcms.db` by default). Hand that file to another app and it has
  everything.
- The **rules** are NOT baked into the database (no enforcing triggers or `CHECK`
  constraints). They live in the application layer. The database trusts its
  writers. Therefore **every writer is responsible for upholding this
  contract** so the data stays consistent no matter which app produced it.

> Why rules-in-app rather than rules-in-DB? It keeps the schema minimal and
> portable, lets enums and behavior evolve without schema migrations, and keeps
> a single, readable definition of "correct" that any language can follow. The
> trade-off — accepted deliberately — is that a misbehaving writer *can* insert
> invalid data; the contract below is what every writer must implement to avoid
> that.

The canonical structure lives in [`schema.sql`](./schema.sql). Create a fresh,
empty, compatible database with nothing but the SQLite CLI:

```bash
sqlite3 tcms.db < db/schema.sql
```

---

## 1. Tables

See [`schema.sql`](./schema.sql) for exact column types and defaults. Summary:

| Table         | Purpose                                                              |
| ------------- | ------------------------------------------------------------------- |
| `schema_meta` | `key/value`; holds `schema_version` so apps can check compatibility.|
| `users`       | QA users (`email` PK, `name`). Identity for attribution/assignment. |
| `areas`       | User-managed functional areas (`name` PK).                          |
| `categories`  | Sub-groups within an area; PK `(area, name)` — see §2.1.            |
| `sprints`     | Optional user-managed sprint tags (`name` PK), e.g. `S23`.          |
| `counters`    | Sequence backing the public TC-ID (`name` PK, `value`).             |
| `test_cases`  | The core entity. One row per test case.                             |

### Relationships (soft / application-enforced)

There are **no hard foreign keys** between `test_cases` and
`users`/`areas`/`categories`, so that historical attribution survives a user,
area, or category being removed.

- `test_cases.assignee_email`, `created_by`, `updated_by` → `users.email`
- `test_cases.area` → `areas.name`
- `(test_cases.area, test_cases.category)` → `categories.(area, name)`
- `test_cases.sprint` → `sprints.name`

Writers should keep these consistent (see §4).

---

## 2. Enumerated fields (allowed values)

These are enforced by the application, not the DB. A compliant writer **must**
only write these values. They are intentionally extensible — to add a value,
update this contract (and bump the schema version if other apps must know).

| Column                   | Allowed values                                        | Default     |
| ------------------------ | ----------------------------------------------------- | ----------- |
| `test_cases.status`      | `Passed`, `Failed`, `Skipped`, `Deferred`, `Blocked`  | `Skipped`   |
| `test_cases.priority`    | `Critical`, `High`, `Medium`, `Low`                   | `Medium`    |
| `test_cases.type`        | `Manual`, `Automated`                                 | `Manual`    |
| `test_cases.test_nature` | `Positive`, `Negative`                                | `Positive`  |
| `test_cases.pinned`      | `0` (false) or `1` (true)                             | `0`         |
| `test_cases.is_new_functionality` | `0` (false) or `1` (true)                    | `0`         |

`title` must be a non-empty (non-whitespace) string.

**`is_new_functionality`** is an optional tag flag: `1` marks a test case that
covers newly built functionality (vs. existing/regression coverage). It is used
purely for filtering.

**`sprint`** (column on `test_cases`) is an optional free-text tag, e.g. `S23`.
Known sprint values are tracked in the `sprints` table so the UI can offer them
in a filter dropdown (§4, §6). May be `NULL`/empty when untagged.

**`test_nature`** distinguishes the intent of a test:

- **`Positive`** — verifies the system behaves correctly given *valid* input and
  expected conditions (the happy path).
- **`Negative`** — verifies the system handles *invalid* input or error
  conditions gracefully (rejections, validation, failures).

### 2.1 Area → Category hierarchy

`area` and `category` form a two-level, **user-managed** hierarchy:

- `area` is the broad functional area (e.g. `Checkout`).
- `category` is a sub-grouping *within* that area (e.g. `Discount`, `Shipping`).
- A test case may have an `area` with no `category`, but a `category` should
  always be paired with the `area` it belongs to.
- The **same category name may appear under different areas** (e.g. both
  `Cart` and `Checkout` could have a `Promo` category), which is why the
  `categories` table is keyed on the `(area, name)` pair.
- There is no fixed list — see §4 for how new areas/categories are created on
  the fly.

---

## 3. Public TC-ID generation rule

`test_cases.tc_id` is the human-readable identifier (e.g. `TC-1001`). To create
the next one, atomically increment the shared counter and format it:

```sql
UPDATE counters SET value = value + 1 WHERE name = 'tc_id' RETURNING value;
-- then:  tc_id = 'TC-' || <returned value>
```

Rules:

- The counter is seeded at `1000`, so the first generated id is `TC-1001`.
- `tc_id` is `UNIQUE`. **Always** use the counter; never hand-pick an id, or you
  risk a collision with a future generated one.
- Do the increment-and-read in a single statement (as above) or inside a
  transaction, so two concurrent writers can't get the same number.

---

## 4. Write rules per operation

### Creating a test case

A compliant `INSERT` must:

1. Generate `tc_id` via the counter rule (§3).
2. Validate `title` is non-empty and any provided enum values are allowed (§2).
3. Set timestamps: `created_at` = `updated_at` = **now** as an ISO-8601 UTC
   string (e.g. `2026-05-29T15:07:39.455Z`).
4. Set `created_by` = `updated_by` = the acting user's `email`.
5. If `area` is non-empty and not already in `areas`, insert it:
   `INSERT OR IGNORE INTO areas (name) VALUES (?)`. If `category` is also
   non-empty, register the pair:
   `INSERT OR IGNORE INTO categories (area, name) VALUES (?, ?)`. (Only register
   a category when an area is present — a category without an area is invalid.)
6. Apply defaults (§2) for any omitted enum/`pinned` fields (`test_nature`
   defaults to `Positive`, `is_new_functionality` defaults to `0`).
7. If `sprint` is non-empty, register it:
   `INSERT OR IGNORE INTO sprints (name) VALUES (?)`.

### Updating a test case — **optimistic edit-locking (required)**

`updated_at` is the concurrency token. To prevent one writer silently
overwriting another, an update **must**:

1. Read the row the user is editing, remembering its current `updated_at`
   (call it `seen_updated_at`).
2. On save, perform a **conditional** update that only writes if nothing changed
   in the meantime:

   ```sql
   UPDATE test_cases
      SET <columns...>,
          updated_at = <new ISO-8601 UTC now>,
          updated_by = <acting user email>
    WHERE id = :id
      AND updated_at = :seen_updated_at;
   ```

3. If the statement reports **0 rows changed**, the record was modified by
   someone else since it was read. **Do not retry blindly.** Re-read the current
   row and surface a "this record changed since you opened it" conflict to the
   user (the reference app returns HTTP 409 with the current row).

> The reference implementation reads-then-compares inside the app and returns
> the current row on conflict; the `WHERE updated_at = :seen` form above is the
> equivalent atomic check and is recommended for other apps.

Also on update: re-validate enums (§2), keep `created_at`/`created_by`
unchanged, and auto-create a referenced new `area` as in step 5 above.

### Bulk operations (no per-row lock)

Bulk update / bulk delete act on a set of ids the user explicitly selected. They
are a deliberate, batch action and intentionally **bypass** the per-row
optimistic-lock check — applying best-effort to all selected rows and reporting
how many were affected. Bulk update still bumps `updated_at`/`updated_by` and
only writes the fields provided in the patch; bulk-setting an `area` also sets
the `category` consistently (clearing it if none is given).

### Pinning (lightweight, no lock)

Toggling `pinned` is a deliberately low-conflict, team-awareness action and is
**exempt** from the optimistic-lock check. A writer may set `pinned` directly,
but should still bump `updated_at`/`updated_by`.

### Deleting

A plain `DELETE FROM test_cases WHERE id = ?`. No soft-delete in v1.

---

## 5. Conventions

- **Timestamps**: ISO-8601 in **UTC** with milliseconds and a trailing `Z`,
  e.g. `2026-05-29T15:07:39.455Z`. Store as TEXT. Sort/compare lexically (this
  format sorts correctly as strings) or via `datetime()`.
- **Emails**: stored **lowercase**; treat as the canonical user key.
- **Booleans**: integer `0`/`1` (SQLite has no native boolean).
- **Empty text**: use `''` rather than `NULL` for the free-text fields
  (`preconditions`, `test_data`, `test_steps`, `expected_result`, `comments`).
- **Ordering for display**: pinned rows first, then most-recently-updated:
  `ORDER BY pinned DESC, datetime(updated_at) DESC`.

---

## 6. Users & areas

- **Users** are owned by the reference app's `.env` (`TCMS_USERS`) and synced
  into the `users` table on startup. Another app that only reads/writes test
  cases does **not** need to manage users — it just references existing
  `users.email` values. If your app adds users directly, insert
  `(email lowercased, name)` and keep emails unique.
- **Areas** are free-form and created on demand (§4, step 5). There is no fixed
  list.
- **Categories** are sub-groups of an area (§2.1), also created on demand and
  stored as `(area, name)` pairs. When offering category choices for a given
  area, query `SELECT name FROM categories WHERE area = ?`.
- **Sprints** are optional free-text tags created on demand and tracked in the
  `sprints` table for the filter dropdown: `SELECT name FROM sprints`.

---

## 7. Portability & concurrency boundaries

- **Single file = portable.** The entire database is one SQLite file. Copy it to
  back up; copy it to move it to another machine. Any compliant app can pick it
  up and continue.
- **One machine, many processes:** SQLite (with `PRAGMA journal_mode = WAL`)
  safely serializes concurrent readers/writers of the **same file on the same
  host**. Multiple local apps sharing the file is fine.
- **Different machines / a live shared database:** SQLite is a local file, not a
  network database server. Two apps on two laptops should each use their **own
  copy** of the file, or exchange the file explicitly. Pointing multiple
  machines at one SQLite file over a network share is **not supported** (network
  filesystems break SQLite's locking). If you need concurrent multi-host writes
  to one live database, migrate the data to a client/server database
  (e.g. PostgreSQL) using this contract as the schema/rules reference.

---

## 8. Versioning

`schema_meta.schema_version` is currently **`3`**. Before reading/writing, an
app may check it:

```sql
SELECT value FROM schema_meta WHERE key = 'schema_version';
```

Bump it (here, in `schema.sql`, and in the app) whenever a structural change
would break apps written against an older version.

### Changelog

- **v3** — Added the `sprints` table and two optional tag columns on
  `test_cases`: `is_new_functionality` (0/1) and `sprint` (free text, e.g.
  `S23`). Both are nullable/defaulted, so older readers still work; the
  reference app auto-migrates an older file by adding the columns/table on
  startup.
- **v2** — Added the `categories` table and `test_cases.category` (Area →
  Category hierarchy, §2.1) and `test_cases.test_nature` (Positive / Negative).
  Both new columns are nullable/defaulted, so a v1 reader still works on a v2
  database (it just ignores the new fields). The reference app auto-migrates a
  v1 file by adding the columns/table on startup.
- **v1** — Initial schema.
