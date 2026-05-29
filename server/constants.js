// Shared enums for the test case domain. The frontend mirrors these in
// client/src/constants.js — keep them in sync.

export const STATUSES = ['Passed', 'Failed', 'Skipped', 'Deferred', 'Blocked'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const TYPES = ['Manual', 'Automated'];
export const TEST_NATURES = ['Positive', 'Negative'];

export const DEFAULT_STATUS = 'Skipped';
export const DEFAULT_PRIORITY = 'Medium';
export const DEFAULT_TYPE = 'Manual';
export const DEFAULT_TEST_NATURE = 'Positive';
