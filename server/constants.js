// Shared enums for the test case domain (a repository of test-case definitions).
//
// Note: execution data (pass/fail status, assignee, run-time priority) is NOT
// part of a repository test case — it belongs to a future Test Runs feature.

// Execution method (UI label: "Execution").
export const TYPES = ['Manual', 'Automated'];

// Whether the case verifies correct behavior or error handling.
export const TEST_NATURES = ['Positive', 'Negative'];

// Test level / suite (UI label: "Type"). These NEST, narrowest → broadest:
//   Sanity ⊆ Smoke ⊆ Regression
// A case is tagged with the narrowest level it belongs to. Inclusive filtering
// (see levelsAtOrBelow) means filtering by a broader level also returns the
// narrower ones.
export const TEST_LEVELS = ['Sanity', 'Smoke', 'Regression'];

/**
 * Given a selected level, return every level that should match it inclusively.
 * Because Sanity ⊆ Smoke ⊆ Regression:
 *   Regression -> [Sanity, Smoke, Regression]  (all)
 *   Smoke      -> [Sanity, Smoke]
 *   Sanity     -> [Sanity]
 */
export function levelsAtOrBelow(level) {
  const idx = TEST_LEVELS.indexOf(level);
  if (idx === -1) return [];
  return TEST_LEVELS.slice(0, idx + 1);
}

export const DEFAULT_TYPE = 'Manual';
export const DEFAULT_TEST_NATURE = 'Positive';
export const DEFAULT_TEST_LEVEL = 'Regression';
