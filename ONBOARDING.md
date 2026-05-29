# Getting TCMS running on your computer (Mac or Windows)

This guide takes you from a brand-new machine to the app open in your browser at
**http://localhost:4000**. No prior setup assumed. It works the same on macOS
and Windows; where they differ, both are shown.

**Time:** ~10 minutes. **You do not need to be a developer.**

---

## What you're installing and why

| Thing | Why | Notes |
| ----- | --- | ----- |
| **Node.js 22+** | Runs the whole app (server + build). | The *only* required dependency. |
| **Git** | To download (clone) the project and pull updates. | Optional — you can also download a ZIP. |

There is **no database to install** — TCMS uses SQLite via Node's built-in
engine, and the demo data files come with the project. Nothing else is needed.

---

## Step 1 — Install Node.js 22 or newer

Check if you already have it. Open a terminal:

- **macOS:** open **Terminal** (Cmd+Space, type "Terminal", Enter).
- **Windows:** open **PowerShell** (Start menu, type "PowerShell", Enter).

Run:

```bash
node --version
```

- If it prints **v22.x.x or higher** (e.g. `v22.11.0`, `v24.x`), skip to Step 2.
- If it says "command not found"/"not recognized", or a version **below 22**,
  install/upgrade using one option below.

### macOS

**Option A — official installer (simplest):**
1. Go to <https://nodejs.org/>.
2. Download the **LTS** installer (make sure it's **22 or newer**; if LTS is
   older, use the "Current" download).
3. Open the `.pkg` and click through the installer.

**Option B — Homebrew (if you use it):**
```bash
brew install node
```

### Windows

**Option A — official installer (simplest):**
1. Go to <https://nodejs.org/>.
2. Download the **LTS** Windows installer (`.msi`), **22 or newer**.
3. Run it, accept defaults (the defaults are fine; no need to tick extra
   tooling).
4. **Close and reopen PowerShell** after installing so it picks up Node.

**Option B — winget (Windows package manager):**
```powershell
winget install OpenJS.NodeJS.LTS
```

### Confirm it worked
Reopen the terminal and run both:
```bash
node --version
npm --version
```
You should see a Node version **≥ 22** and an npm version (e.g. `10.x`/`11.x`).

> **Why 22+?** TCMS uses Node's built-in `node:sqlite`, which only exists in
> Node 22+. On older Node the app won't start.

---

## Step 2 — Get the project

Pick **one** of these.

### Option A — with Git (recommended; makes updates easy)

If you don't have Git: macOS will prompt to install it the first time you run
`git`; on Windows install from <https://git-scm.com/download/win> (accept
defaults).

```bash
git clone https://github.com/imoretull/TCMS1.git
cd TCMS1
```

### Option B — download a ZIP (no Git)

1. Open <https://github.com/imoretull/TCMS1> in a browser.
2. Click the green **Code** button → **Download ZIP**.
3. Unzip it, then in your terminal `cd` into the unzipped folder, e.g.:
   - macOS: `cd ~/Downloads/TCMS1-main`
   - Windows: `cd $HOME\Downloads\TCMS1-main`

> **Tip:** to `cd` into a folder, you can type `cd ` (with a space) and then
> drag the folder from Finder/Explorer onto the terminal window, then Enter.

---

## Step 3 — Install dependencies and build (one time)

From inside the project folder:

```bash
npm run setup
```

This does everything: installs the server + UI packages, builds the web app, and
creates the demo databases. It takes a couple of minutes the first time and
prints a lot of lines — that's normal. It's finished when you get your prompt
back with no error.

> The repo already includes the demo `.env` config and the `amazon.db` /
> `google.db` data files, so there's nothing to configure.

---

## Step 4 — Start the app

```bash
npm start
```

You should see:
```
  TCMS server running at http://localhost:4000
  10 QA user(s) configured.
```

Open **http://localhost:4000** in your browser.

**To stop the app:** click the terminal and press **Ctrl + C** (on both Mac and
Windows it's Ctrl+C, not Cmd).

**To start it again later:** open a terminal, `cd` into the project folder, and
run `npm start`. (You only run `npm run setup` once, not every time.)

---

## Step 5 — Sign in

On the login screen, pick a user and enter their PIN. For example:

| Name | PIN |
| ---- | --- |
| John Carter | `1111` |
| Vishnu Rao | `2222` |
| Sandy Patel | `3333` |

(The full list is in the `.env` file / the main README.)

Use the **dataset switcher** in the top bar to flip between the **Amazon** and
**Google** sample data.

---

## Updating to the latest version later

If you cloned with Git:
```bash
cd TCMS1
git pull
npm run setup
npm start
```
(`git pull` grabs the newest code; `npm run setup` re-installs/rebuilds in case
anything changed.)

If you downloaded a ZIP, download a fresh ZIP and repeat Step 3.

---

## Troubleshooting

**"node: command not found" / "not recognized"**
Node isn't installed or the terminal was opened before installing. Close and
reopen the terminal; if it still fails, redo Step 1. On Windows, make sure you
reopened PowerShell after the install.

**"Port 4000 is already in use" / `EADDRINUSE`**
Something is already using port 4000 — often a previous copy of this app still
running.
- Find and stop the old one, **or** run on a different port:
  - macOS/Linux: `PORT=4100 npm start`
  - Windows PowerShell: `$env:PORT=4100; npm start`
- Then open `http://localhost:4100` instead.

**The app starts but the page is blank / "API is running" text**
The web app wasn't built. Run `npm run build`, then `npm start` again.
(`npm run setup` includes the build, so re-running it also fixes this.)

**`npm run setup` fails with errors about Node version**
You're on Node < 22. Recheck `node --version` and upgrade (Step 1).

**Permission errors during `npm install` (macOS)**
Don't use `sudo`. If npm was previously installed with wrong permissions,
installing Node fresh from <https://nodejs.org/> usually resolves it.

**I want to reset the sample data**
```bash
npm run seed:demo
```
This rebuilds the Amazon and Google demo datasets from scratch.

---

## Quick reference

```bash
node --version       # must be v22 or higher
git clone https://github.com/imoretull/TCMS1.git
cd TCMS1
npm run setup        # one time: install + build + seed demo data
npm start            # run it → http://localhost:4000
# Ctrl+C to stop
```

Need more detail on configuration, users/PINs, datasets, or the data model? See
[README.md](README.md) and [db/SCHEMA.md](db/SCHEMA.md).
