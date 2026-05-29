import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const PORT = Number(process.env.PORT) || 4000;

export const DATABASE_FILE = path.resolve(
  ROOT_DIR,
  process.env.DATABASE_FILE || './data/tcms.db'
);

/**
 * Parse the TCMS_USERS env string into a list of { name, email, pin }.
 *
 * Format: "Display Name <email>:PIN, Display Name <email>:PIN, ..."
 * This is the single source of truth for who can sign in (v1 auth).
 */
export function parseUsers() {
  const raw = process.env.TCMS_USERS || '';
  const users = [];

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Matches: Name <email>:pin   (Name optional)
    const match = trimmed.match(/^(.*?)<\s*([^>]+?)\s*>\s*:\s*(\S+)$/);
    if (!match) {
      console.warn(`[config] Skipping malformed TCMS_USERS entry: "${trimmed}"`);
      continue;
    }

    const name = match[1].trim() || match[2].trim();
    const email = match[2].trim().toLowerCase();
    const pin = match[3].trim();
    users.push({ name, email, pin });
  }

  return users;
}

export const USERS = parseUsers();

if (USERS.length === 0) {
  console.warn(
    '[config] No TCMS_USERS configured. Copy .env.example to .env and add users.'
  );
}
