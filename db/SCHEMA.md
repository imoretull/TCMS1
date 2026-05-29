# TCMS Database Contract

**Schema version: 1**

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
| `counters`    | Sequence backing the public TC-ID (`name` PK, `value`).             |
| `test_cases`  | The core entity. One row per test case.                             |

### Relationships (soft / application-enforced)

There are **no hard foreign keys** between `test_cases` and `users`/`areas`, so
that historical attribution survives a user or area being removed.

- `test_cases.assignee_email`, `created_by`, `updated_by` → `users.email`
- `test_cases.area` → `areas.name`

Writers should keep these consistent (see §4).

---

## 2. Enumerated fields (allowed values)

These are enforced by the application, not the DB. A compliant writer **must**
only write these values. They are intentionally extensible — to add a value,
update this contract (and bump the schema version if other apps must know).

| Column                | Allowed values                                           | Default     |
| --------------------- | -------------------------------------------------------- | ----------- |
| `test_cases.status`   | `Passed`, `Failed`, `Skipped`, `Deferred`, `Blocked`     | `Skipped`   |
| `test_cases.priority` | `Critical`, `High`, `Medium`, `Low`                      | `Medium`    |
| `test_cases.type`     | `Manual`, `Automated`                                    | `Manual`    |
| `test_cases.pinned`   | `0` (false) or `1` (true)                                | `0`         |

`title` must be a non-empty (non-whitespace) string.

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
   `INSERT OR IGNORE INTO areas (name) VALUES (?)`.
6. Apply defaults (§2) for any omitted enum/`pinned` fields.

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

`schema_meta.schema_version` is currently **`1`**. Before reading/writing, an
app may check it:

```sql
SELECT value FROM schema_meta WHERE key = 'schema_version';
```

Bump it (here, in `schema.sql`, and in the app) whenever a structural change
would break apps written against an older version.
