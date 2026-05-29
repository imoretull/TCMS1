# TCMS — Test Case Management System

A lightweight, modern, web-based test case management tool for small QA teams.
Built as a pilot to replace ad-hoc Excel sheets and heavyweight tools like
Zephyr, with a clean table-first UI, simple filtering/sorting, edit-locking,
and a single-file database.

> Stack: **React (Vite)** front end · **Express** API · **SQLite** (single
> file) · **Email + PIN** auth. One language (JavaScript) front-to-back; runs on
> macOS and Windows with minimal setup.

---

## Features

- **Table-first view** of all test cases with sticky headers and clean density.
- **Search, filter, and sort** by TC ID, title, area, category, status,
  priority, assignee, type (manual/automated), and test nature
  (positive/negative).
- **Area → Category hierarchy** — group cases by a broad area (e.g. Checkout)
  and a sub-category within it (e.g. Discount). Both are user-managed: add a new
  area or category on the fly while editing; category choices are scoped to the
  selected area.
- **Positive / Negative** — mark each case's test nature (verifying correct
  behavior vs. graceful handling of invalid input), shown as a badge and
  filterable.
- **Optional tags: Sprint & New functionality** — tag a case with a sprint
  (e.g. `S23`, remembered for the filter dropdown) and/or flag it as "new
  functionality". Both are optional and have their own filters.
- **Pin to top** — flag urgent cases so they surface for the whole team.
- **Full CRUD** with a slide-in detail/edit panel (progressive disclosure of
  all fields — the table shows the essentials).
- **Duplicate** — clone an existing case into a new editable draft (fresh TC-ID,
  "(copy)" title) to author similar cases quickly.
- **Bulk actions** — select rows (with select-all of the filtered set) to bulk
  **delete** or bulk **edit** (set status, priority, assignee, area/category, or
  sprint on many cases at once).
- **Dataset switcher** — switch the live database from the header (e.g. Amazon ↔
  Google). Each dataset is a separate SQLite file with the *same* schema, so it's
  truly plug-and-play: drop a new seeded `.db` into the data folder and it
  appears in the switcher.
- **Edit-locking / conflict detection** — optimistic locking via `updated_at`.
  If someone changed a case while you were editing, you get a clear
  "changed since you opened it" prompt instead of silently clobbering them.
- **Lightweight identity** — pick your name, enter a PIN. Edits and assignees
  are attributed to you.
- **Audit fields** — created/updated by whom and when.

Pre-seeded with **Amazon-style demo data** — 45 cases across 5 areas (Cart,
Checkout, Search, Account, Payments) with ~32 categories and a mix of positive
and negative cases — plus **10 fake QA users**.

---

## Quick start

You need **Node.js 22+** (`node --version` to check) — the app uses Node's
built-in `node:sqlite`, so there's no native build step.

```bash
# 1. From the project root, install everything (root + client deps),
#    build the React app, and seed the demo datasets (Amazon + Google):
npm run setup

# 2. Start the server:
npm start
```

Then open **http://localhost:4000**.

`npm run setup` is a convenience that runs `npm install`, `npm run build`, and
`npm run seed:demo` in sequence. To do it manually:

```bash
npm install        # installs root deps + (via postinstall) client deps
npm run build      # builds the React app into client/dist
npm run seed:demo  # seeds amazon.db and google.db demo datasets
npm start          # serves the app on http://localhost:4000
```

### Signing in

Pick any user from the dropdown and enter their PIN. Default demo users (defined
in `.env`):

| Name         | Email                | PIN  |
| ------------ | -------------------- | ---- |
| John Carter  | john@example.com     | 1111 |
| Vishnu Rao   | vishnu@example.com   | 2222 |
| Sandy Patel  | sandy@example.com    | 3333 |
| Maria Gomez  | maria@example.com    | 4444 |
| Wei Chen     | wei@example.com      | 5555 |
| Aisha Khan   | aisha@example.com    | 6666 |
| Tom Becker   | tom@example.com      | 7777 |
| Priya Nair   | priya@example.com    | 8888 |
| Diego Silva  | diego@example.com    | 9999 |
| Hana Sato    | hana@example.com     | 1010 |

---

## Configuration

Configuration lives in a `.env` file in the project root. A starter `.env` is
included for the pilot; `.env.example` documents every option.

```ini
PORT=4000
DATABASE_FILE=./data/tcms.db

# QA users + PINs (v1 auth — plaintext, trusted internal use only).
# Format: Name <email>:PIN, Name <email>:PIN, ...
TCMS_USERS=John Carter <john@example.com>:1111, Vishnu Rao <vishnu@example.com>:2222
```

- **Users are the single source of truth in `.env`.** On every server start,
  the user list is synced into the DB (added/renamed). To add or remove a user
  or change a PIN, just edit `.env` and restart — no migration needed.
- Removed users stay in the DB so historical attribution (who created/was
  assigned a case) is preserved; they simply can no longer sign in.

> **Security note (by design for v1):** PINs are stored in plaintext in `.env`
> for a trusted internal network. This is **not** production-grade auth — full
> SSO/hashed credentials are a documented future enhancement.

---

## Development

For hot-reloading front + back end together:

```bash
npm run dev
```

This runs the Express API (with `node --watch`) on port **4000** and the Vite
dev server on port **5173** (which proxies `/api` to the backend). Open
**http://localhost:5173** during development.

---

## Data & backups

- Each dataset is a single SQLite file in `./data/` (e.g. `amazon.db`,
  `google.db`). The folder is set by `DATA_DIR`; the startup dataset by
  `DEFAULT_DATASET`.
- **Back up:** copy the `data/` folder (or an individual `*.db`). **Restore:**
  put the file back. That's it.
- **Reseed the demo datasets:** `npm run seed:demo` rebuilds `amazon.db` and
  `google.db` from scratch. Seed one explicitly with, e.g.,
  `node server/seed.js --dataset=google --company=Google --reset`.

---

## Multiple datasets & the switcher

Because every dataset shares the **same schema/contract**, the app can serve
different SQLite files interchangeably — true plug-and-play:

- The header has a **dataset switcher**. Switching re-points the live database
  server-wide; the table, filters, and detail panel reload against the selected
  file. (The demo brand label follows the active dataset, e.g. Amazon ↔ Google.)
- The switcher lists every `*.db` in `DATA_DIR`. **To add a dataset**, drop a
  seeded `.db` into that folder — it appears automatically. Create one with the
  seed tool (it applies the schema to a new file):
  ```bash
  node server/seed.js --dataset=microsoft --company=Amazon --reset
  ```
  (Use any `--company` from `server/seedData.js`, or add your own set there.)
- Switching is **global** (everyone sees the same active dataset) and datasets
  are fully **isolated** — edits in one file never affect another.

---

## Standalone, plug-and-play database

The database is **separated from the application logic** so that *another
application — in any language, on any machine — can use the same data*:

- The **structure** is a single canonical file, [`db/schema.sql`](db/schema.sql),
  which is the one source of truth (the app loads it on startup). Any tool can
  create a fresh, compatible database from it with no dependency on this app:
  ```bash
  sqlite3 tcms.db < db/schema.sql
  ```
- The **rules** (TC-ID generation, `updated_at` stamping, optimistic
  edit-locking, enum validation, area auto-creation) intentionally live in the
  application layer, **not** in the database — the DB is a passive, portable
  store. Every application that writes to the file must follow the documented
  contract in **[`db/SCHEMA.md`](db/SCHEMA.md)** so the data stays consistent no
  matter which app produced it.
- `schema_meta.schema_version` lets another app check compatibility before
  reading/writing.

> **Portability boundary:** SQLite is a local file, not a network server. To
> share data with an app on another laptop, hand over a *copy* of the file (or
> use a shared host). Multiple machines writing one live SQLite file over a
> network share is not supported — for that, migrate to PostgreSQL using
> [`db/SCHEMA.md`](db/SCHEMA.md) as the schema/rules reference. See §7 of that
> document.

---

## Project layout

```
.
├── .env                # configuration (port, db path, users + PINs)
├── .env.example        # documented template
├── package.json        # root scripts: setup / build / seed / start / dev
├── db/
│   ├── schema.sql      # canonical DB structure (single source of truth)
│   └── SCHEMA.md       # the data contract every writer must follow
├── server/
│   ├── index.js        # Express app + routes
│   ├── config.js       # env parsing (incl. TCMS_USERS)
│   ├── db.js           # SQLite connection; applies db/schema.sql; user sync
│   ├── auth.js         # email+PIN verification, sessions, middleware
│   ├── testCases.js    # CRUD + optimistic locking (the data model)
│   ├── constants.js    # status/priority/type enums
│   └── seed.js         # Amazon-style demo data
└── client/             # React app (Vite)
    └── src/
        ├── App.jsx
        ├── api.js
        ├── styles.css
        └── components/  # Login, Toolbar, TestCaseTable, TestCasePanel, badges
```

---

## How concurrency / edit-locking works

Multiple people can view the same case at once. When you open a case to edit,
the app remembers its `updated_at` timestamp. On save, the server checks that
the stored `updated_at` still matches. If someone else saved in the meantime,
the server returns **409 Conflict** with their current version, and the UI shows
a banner letting you load their version and re-apply your changes — so no edit is
ever silently overwritten. SQLite handles the underlying write serialization.

Pinning is a deliberately lightweight, low-conflict action and does **not** use
optimistic locking.

---

## Deployment

The app is container-friendly: it's a single Node process serving a static
React bundle plus a SQLite file. To run anywhere, ensure Node 18+, set `.env`,
run `npm run setup` once, then `npm start`. Mount/persist the `data/` directory
to keep the database across restarts.

---

## License

MIT — open-source ready, no proprietary dependencies.
