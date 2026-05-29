import crypto from 'node:crypto';
import { USERS } from './config.js';

// In-memory session store. Sessions are ephemeral by design (v1, single
// process) — restarting the server logs everyone out, which is acceptable
// for a trusted internal pilot.
const sessions = new Map(); // token -> { email, name }

const COOKIE_NAME = 'tcms_session';

/** Verify an email + PIN against the configured user list. */
export function verifyCredentials(email, pin) {
  const normalized = (email || '').trim().toLowerCase();
  const user = USERS.find((u) => u.email === normalized);
  if (!user) return null;

  // Constant-time-ish comparison to avoid trivial timing leaks on the PIN.
  const a = Buffer.from(String(pin));
  const b = Buffer.from(String(user.pin));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return { email: user.email, name: user.name };
}

export function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user);
  return token;
}

export function destroySession(token) {
  sessions.delete(token);
}

export function getSession(token) {
  return token ? sessions.get(token) || null : null;
}

export { COOKIE_NAME };

/** Express middleware: attaches req.user or responds 401. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = getSession(token);
  if (!user) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  req.user = user;
  next();
}
