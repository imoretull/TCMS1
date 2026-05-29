/**
 * Seed a dataset with realistic demo test cases.
 *
 * Usage:
 *   npm run seed                                  (seed the default dataset, Amazon data)
 *   npm run seed -- --reset                       (wipe + reseed the default dataset)
 *   npm run seed -- --dataset=amazon --company=Amazon --reset
 *   npm run seed -- --dataset=google --company=Google --reset
 *
 * --dataset switches the active .db file (creating it if needed); --company
 * chooses which set of demo cases to load. Users come from .env (TCMS_USERS)
 * and are synced into every dataset automatically by db.js.
 */
import db, { transaction, openDataset } from './db.js';
import { createTestCase } from './testCases.js';
import { listUsers } from './testCases.js';
import { CASE_SETS } from './seedData.js';

const RESET = process.argv.includes('--reset');

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

const DATASET = argValue('dataset', null);
const COMPANY = argValue('company', 'Amazon');

if (DATASET) {
  // Point the active connection at the requested dataset (creates the file via
  // the normal schema setup if it doesn't exist yet).
  openDataset(DATASET);
  console.log(`Seeding dataset "${DATASET}" with ${COMPANY} demo data.`);
}

const cases = CASE_SETS[COMPANY];
if (!cases) {
  console.error(
    `Unknown company "${COMPANY}". Available: ${Object.keys(CASE_SETS).join(', ')}`
  );
  process.exit(1);
}

if (RESET) {
  console.log('Resetting test cases, areas, categories, and sprints...');
  db.exec(
    `DELETE FROM test_cases; DELETE FROM areas; DELETE FROM categories; DELETE FROM sprints;`
  );
  db.prepare(`UPDATE counters SET value = 1000 WHERE name = 'tc_id'`).run();
}

const existing = db.prepare(`SELECT COUNT(*) AS n FROM test_cases`).get().n;
if (existing > 0 && !RESET) {
  console.log(
    `Database already has ${existing} test case(s). Use "npm run seed -- --reset" to reseed.`
  );
  process.exit(0);
}

const users = listUsers();
if (users.length === 0) {
  console.error('No users configured. Set TCMS_USERS in .env and try again.');
  process.exit(1);
}

// Round-robin assignee picker for even distribution.
let assigneeIdx = 0;
const nextAssignee = () => users[assigneeIdx++ % users.length].email;

// We pass a "system" user as the author of seed data, attributed to the
// first configured user so audit fields are populated sensibly.
const author = { email: users[0].email, name: users[0].name };


// Spread cases across a few sprints, and flag some as new functionality, so the
// optional Sprint and "New functionality" tag filters have meaningful demo data.
// Deterministic by index (no randomness) so reseeds are reproducible.
const SPRINTS = ['S21', 'S22', 'S23'];

let created = 0;
transaction(() => {
  cases.forEach((c, i) => {
    // Default tag derivation; explicit values on a case still win.
    const sprint = c.sprint ?? SPRINTS[i % SPRINTS.length];
    // Mark the most recent sprint's work, plus any negative case, as "new".
    const isNewFunctionality =
      c.isNewFunctionality ?? (sprint === 'S23' || c.testNature === 'Negative');
    createTestCase(
      { ...c, sprint, isNewFunctionality, assigneeEmail: nextAssignee() },
      author
    );
    created++;
  });
});

const areaCount = db.prepare(`SELECT COUNT(*) n FROM areas`).get().n;
const catCount = db.prepare(`SELECT COUNT(*) n FROM categories`).get().n;
const negCount = db
  .prepare(`SELECT COUNT(*) n FROM test_cases WHERE test_nature = 'Negative'`)
  .get().n;
const newCount = db
  .prepare(`SELECT COUNT(*) n FROM test_cases WHERE is_new_functionality = 1`)
  .get().n;
const sprintList = db
  .prepare(`SELECT name FROM sprints ORDER BY name`)
  .all()
  .map((r) => r.name)
  .join(', ');
console.log(
  `Seeded ${created} test cases across ${areaCount} areas and ${catCount} categories ` +
    `(${negCount} negative, ${created - negCount} positive).`
);
console.log(`New-functionality cases: ${newCount}. Sprints: ${sprintList}.`);
console.log(`Users available for sign-in: ${users.length}`);
process.exit(0);
