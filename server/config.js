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

// The directory that holds the selectable dataset files (*.db). The dataset
// switcher lists every .db in here. Defaults to the folder of DATABASE_FILE.
export const DATA_DIR = path.resolve(
  ROOT_DIR,
  process.env.DATA_DIR || path.dirname(DATABASE_FILE)
);

// Friendly name of the dataset selected at startup (matched against the .db
// filename without extension, case-insensitively). Falls back to the
// DATABASE_FILE's name, then to whatever is found first.
export const DEFAULT_DATASET =
  process.env.DEFAULT_DATASET ||
  path.basename(DATABASE_FILE, path.extname(DATABASE_FILE));

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
