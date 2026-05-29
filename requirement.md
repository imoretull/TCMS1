# TCMS — Test Case Management System

## 1. Overview

TCMS is a lightweight, web-based test case management tool for internal corporate use, intended to be open-sourced. It lets a small QA team manage test cases across multiple areas of an application through simple CRUD operations, with filtering, sorting, and basic collaboration features.

The goal is a **modern, clean, lightweight** application — not a clunky, bloated clone of heavyweight tools. It should start with a minimal, well-built core and leave clear room to grow.

### Target users
- Up to **10 QA engineers**, each responsible for one or more areas of the application.
- Trusted internal users on a corporate network — full enterprise authentication is **not** required at this stage.

### Demo data
For demonstration and seeding:
- Use **Amazon-style test cases** spread across several functional areas (e.g. Cart, Checkout, Search, Account, Payments).
- Use **fake user names** — e.g. John, Vishnu, Sandy — up to 10 users.

---

## 2. Guiding Principles

1. **Lightweight & modern** — clean UI, fast, minimal dependencies. Avoid bloat.
2. **Minimal first, room to grow** — ship a small, solid core; defer advanced features (see §8).
3. **Easy to run anywhere** — must run on localhost on both **macOS and Windows** with minimal setup. No heavyweight runtime or complex install.
4. **Low-maintenance storage** — the database must be simple to operate, back up, and troubleshoot, since ongoing cloud support will be minimal.
5. **Follow established conventions** — borrow proven UX patterns from existing tools (Jira, Zephyr, TestRail, Xray) and consolidate them, rather than reinventing.

---

## 3. Technical Decisions

| Concern        | Decision | Rationale |
|----------------|----------|-----------|
| **Language / runtime** | Node.js (JavaScript front-to-back) | Single language, trivial to run on Mac/Windows, easy cloud deploy. |
| **Frontend**   | React | Rich ecosystem for interactive, filterable/sortable table UIs. |
| **Database**   | SQLite (single file) | Lightweight, zero-config, native row-level locking for concurrent edits, easy to back up. Replaces the originally proposed JSON flat file to avoid hand-rolled locking. |
| **Auth**       | Email + PIN | User selects their email and enters a short PIN. Lightweight identity for attributing edits and assignees; no password infrastructure. |
| **Packaging**  | Container-friendly (e.g. Docker) | Hosting (GitLab self-hosted / AWS / Azure) is TBD; keep deployment generic. |

### Concurrency & locking
Multiple users may view the same test case simultaneously. To prevent two users from overwriting each other when editing the **same test case**, the app must implement an edit-locking / conflict-detection mechanism (e.g. optimistic locking via a version/`updated_at` check, with a clear "this record changed since you opened it" message). SQLite handles the underlying write serialization.

### Authentication (v1)
- A user identifies themselves by **email**, chosen from the known set of QA users.
- Access is gated by a **simple numeric PIN** tied to that email.
- PINs are stored as **plaintext in an environment / `.env` file** (acceptable for this trusted internal v1; not for production-grade security). The `.env` defines the QA user list and their PINs.
- This is sufficient for attributing changes, showing assignees, and basic access control. Full SSO/role-based auth and hashed credentials are deferred (see §8).

---

## 4. Core Data Model — Test Case

Each test case should support at least the following fields:

| Field | Type | Notes |
|-------|------|-------|
| **TC ID** | string/auto | Unique, human-readable identifier (e.g. `TC-1024`). |
| **Title / Summary** | string | Short description. |
| **Area** | enum/string | User-managed — users can add new areas on the fly. |
| **Status** | enum | Passed, Failed, Skipped, Deferred, Blocked (extendable). |
| **Priority** | enum | Critical, High, Medium, Low. |
| **Assignee** | user | One of the QA users (by email). |
| **Type** | enum | **Manual** or **Automated** (flag). |
| **Preconditions** | text | Setup required before execution. |
| **Test Data** | text | Data needed to run the test. |
| **Test Steps** | text/list | Ordered steps to execute. |
| **Expected Result** | text | Expected outcome. |
| **Comments** | text | Free-form notes / team discussion. |
| **Pinned** | boolean | Flag to pin the case to the top of the table (urgency / team awareness). |
| **Created / Updated** | timestamp + user | Audit fields; `updated_at` also drives conflict detection. |

---

## 5. UI Requirements

### Table view (primary screen)
- **Tabular layout** of test cases — the central interface.
- **Filter, sort, and search** by: TC ID, Area, Status (Passed/Failed/Skipped/etc.), Priority, Assignee, and Type (manual/automated).
- **Progressive disclosure of columns:** because a normal browser cannot comfortably fit every field, show a curated set of **essential columns by default**, with the ability to expand/configure to see the rest (detail panel or expandable row). Follow patterns from Jira / Zephyr.
- **Pin to top:** a clickable icon on each row to pin/flag a test case so it surfaces at the top for the whole team (urgent or needs awareness).
- Clean, uncluttered presentation — readable density, not a wall of columns.

### CRUD
- Create, read, update, and delete test cases — the core day-to-day workflow.
- Editing respects the concurrency/locking rules in §3.

### Identity
- Lightweight login (email + PIN). Current user is visible; edits and assignees are attributed to them.

---

## 6. Non-Functional Requirements

- **Cross-platform:** runs on localhost on macOS and Windows with minimal setup.
- **Easy ops:** single-file DB, simple backup/restore, minimal moving parts for DevOps.
- **Performance:** snappy filtering/sorting for the expected scale (10 users, hundreds–low-thousands of test cases).
- **Open source ready:** clean code, clear README, no proprietary dependencies.

---

## 7. Deployment

- Initial target: **localhost**, later hosted in the cloud (AWS or Azure) or on a DevOps-managed application server.
- Repository likely hosted on **GitLab**; the app server would be operated by DevOps and accessible to the team.
- Keep deployment generic and container-friendly so the final hosting choice stays open.

---

## 8. Future Enhancements (Out of Scope for v1)

Documented now for design awareness; **not** to be built in the first version:

- **Test plans** — group test cases into plans per area.
- **Smart filter sections** — e.g. saved/curated filters for "new functionality" so relevant cases are easy to surface.
- **Automation integration** — ingest results from automated test runs.
- **Dashboard** — metrics and charts.
- **Granular access control** — read-only vs. read-write roles; fuller authentication.
- **Parity features** from popular tools — TestRail, Zephyr, Xray (e.g. test execution runs, requirements traceability, integrations).

---

## 9. Resolved Decisions

- **Priority:** Critical, High, Medium, Low.
- **Status:** Passed, Failed, Skipped, Deferred, Blocked (extendable).
- **Area:** user-managed — users can add new areas on the fly.
- **PINs:** stored as plaintext in a `.env` file; the same file defines the QA user list. PIN management is manual (edit the `.env`).
- **Severity:** dropped for v1 (Priority captures urgency); can be added later if needed.
