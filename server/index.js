import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT, ROOT_DIR, USERS } from './config.js';
import { STATUSES, PRIORITIES, TYPES, TEST_NATURES } from './constants.js';
import {
  verifyCredentials,
  createSession,
  destroySession,
  requireAuth,
  COOKIE_NAME,
} from './auth.js';
import {
  listTestCases,
  getTestCase,
  createTestCase,
  updateTestCase,
  setPinned,
  deleteTestCase,
  listAreas,
  listCategoriesByArea,
  listUsers,
  ConflictError,
  ValidationError,
} from './testCases.js';

const app = express();
app.use(express.json());
app.use(cookieParser());

const api = express.Router();

// ── Auth ────────────────────────────────────────────────────────────────────

// Public list of users (names + emails) so the login screen can offer a picker.
// PINs are never exposed.
api.get('/users', (req, res) => {
  res.json(USERS.map((u) => ({ email: u.email, name: u.name })));
});

api.post('/auth/login', (req, res) => {
  const { email, pin } = req.body || {};
  const user = verifyCredentials(email, pin);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or PIN.' });
  }
  const token = createSession(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
  res.json({ user });
});

api.post('/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) destroySession(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Metadata ──────────────────────────────────────────────────────────────-

api.get('/meta', requireAuth, (req, res) => {
  res.json({
    statuses: STATUSES,
    priorities: PRIORITIES,
    types: TYPES,
    testNatures: TEST_NATURES,
    areas: listAreas(),
    categoriesByArea: listCategoriesByArea(),
    users: listUsers(),
  });
});

// ── Test cases ────────────────────────────────────────────────────────────-

api.get('/test-cases', requireAuth, (req, res) => {
  res.json(listTestCases());
});

api.get('/test-cases/:id', requireAuth, (req, res) => {
  const tc = getTestCase(Number(req.params.id));
  if (!tc) return res.status(404).json({ error: 'Not found.' });
  res.json(tc);
});

api.post('/test-cases', requireAuth, (req, res, next) => {
  try {
    const tc = createTestCase(req.body || {}, req.user);
    res.status(201).json(tc);
  } catch (err) {
    next(err);
  }
});

api.put('/test-cases/:id', requireAuth, (req, res, next) => {
  try {
    const tc = updateTestCase(Number(req.params.id), req.body || {}, req.user);
    if (!tc) return res.status(404).json({ error: 'Not found.' });
    res.json(tc);
  } catch (err) {
    next(err);
  }
});

api.post('/test-cases/:id/pin', requireAuth, (req, res) => {
  const tc = setPinned(Number(req.params.id), !!req.body?.pinned, req.user);
  if (!tc) return res.status(404).json({ error: 'Not found.' });
  res.json(tc);
});

api.delete('/test-cases/:id', requireAuth, (req, res) => {
  const ok = deleteTestCase(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

app.use('/api', api);

// ── Centralized error handling ──────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (err instanceof ConflictError) {
    return res.status(409).json({ error: err.message, current: err.current });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Serve the built React app (production) ──────────────────────────────────

const clientDist = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: send index.html for any non-API GET route.
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .send(
        'TCMS API is running. Build the client with "npm run build" or use "npm run dev" for development.'
      );
  });
}

app.listen(PORT, () => {
  console.log(`\n  TCMS server running at http://localhost:${PORT}`);
  console.log(`  ${USERS.length} QA user(s) configured.\n`);
});
