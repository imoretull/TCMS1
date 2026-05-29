/**
 * Seed the database with realistic Amazon-style demo data.
 *
 * Usage:  npm run seed            (adds data; safe to run on an empty DB)
 *         npm run seed -- --reset (wipes existing test cases/areas first)
 *
 * Users come from .env (TCMS_USERS) and are synced automatically by db.js.
 */
import db, { transaction } from './db.js';
import { createTestCase } from './testCases.js';
import { listUsers } from './testCases.js';

const RESET = process.argv.includes('--reset');

if (RESET) {
  console.log('Resetting test cases and areas...');
  db.exec(`DELETE FROM test_cases; DELETE FROM areas;`);
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

const cases = [
  // ── Cart ──────────────────────────────────────────────────────────────────
  {
    title: 'Add a single item to the cart from the product page',
    area: 'Cart',
    status: 'Passed',
    priority: 'High',
    type: 'Automated',
    preconditions: 'User is signed in. Product "Echo Dot (5th Gen)" is in stock.',
    testData: 'Product: Echo Dot (5th Gen), ASIN B09B8V1LZ3',
    testSteps:
      '1. Open the product detail page.\n2. Click "Add to Cart".\n3. Open the cart.',
    expectedResult:
      'Cart count increments to 1 and the item appears in the cart with the correct price.',
    comments: 'Core happy path — covered by automation in the smoke suite.',
    pinned: true,
  },
  {
    title: 'Update item quantity in the cart',
    area: 'Cart',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    preconditions: 'Cart contains at least one item.',
    testData: 'Quantity change: 1 -> 3',
    testSteps:
      '1. Open the cart.\n2. Change the quantity dropdown to 3.\n3. Observe the subtotal.',
    expectedResult: 'Quantity updates to 3 and the subtotal recalculates correctly.',
  },
  {
    title: 'Remove an item from the cart',
    area: 'Cart',
    status: 'Passed',
    priority: 'Medium',
    type: 'Automated',
    preconditions: 'Cart contains exactly one item.',
    testSteps: '1. Open the cart.\n2. Click "Delete" under the item.',
    expectedResult: 'Item is removed and the cart shows the empty-cart state.',
  },
  {
    title: 'Save an item for later',
    area: 'Cart',
    status: 'Skipped',
    priority: 'Low',
    type: 'Manual',
    testSteps:
      '1. Open the cart with one item.\n2. Click "Save for later".',
    expectedResult:
      'Item moves to the "Saved for later" section and is removed from the active cart.',
  },
  {
    title: 'Cart persists across sessions for a signed-in user',
    area: 'Cart',
    status: 'Failed',
    priority: 'High',
    type: 'Manual',
    preconditions: 'Signed-in user adds an item, then signs out and back in.',
    testSteps:
      '1. Add an item to the cart.\n2. Sign out.\n3. Sign back in.\n4. Open the cart.',
    expectedResult: 'Previously added item is still present in the cart.',
    comments: 'FAILS intermittently on staging — cart cleared after re-login. Bug AMZ-4521.',
    pinned: true,
  },
  {
    title: 'Cart shows correct subtotal with mixed quantities',
    area: 'Cart',
    status: 'Passed',
    priority: 'Medium',
    type: 'Automated',
    testData: 'Item A x2 @ $19.99, Item B x1 @ $5.00',
    expectedResult: 'Subtotal equals $44.98.',
  },
  {
    title: 'Empty cart displays recommended products',
    area: 'Cart',
    status: 'Deferred',
    priority: 'Low',
    type: 'Manual',
    expectedResult: 'Empty cart page shows a "Recommended for you" carousel.',
    comments: 'Deferred — recommendations service not yet wired in test env.',
  },

  // ── Checkout ────────────────────────────────────────────────────────────────
  {
    title: 'Complete checkout with a saved credit card',
    area: 'Checkout',
    status: 'Passed',
    priority: 'Critical',
    type: 'Automated',
    preconditions: 'User has a default address and a saved Visa card.',
    testData: 'Card: Visa ****4242, Address: Seattle default',
    testSteps:
      '1. Add an item to the cart.\n2. Proceed to checkout.\n3. Confirm address and payment.\n4. Place the order.',
    expectedResult:
      'Order is placed, an order number is shown, and a confirmation email is queued.',
    comments: 'Critical revenue path — runs in every release pipeline.',
    pinned: true,
  },
  {
    title: 'Apply a valid promo code at checkout',
    area: 'Checkout',
    status: 'Passed',
    priority: 'High',
    type: 'Manual',
    testData: 'Promo code: SAVE10 (10% off)',
    testSteps:
      '1. Go to checkout.\n2. Enter promo code SAVE10.\n3. Click "Apply".',
    expectedResult: 'Order total is reduced by 10% and the discount line is shown.',
  },
  {
    title: 'Reject an expired promo code at checkout',
    area: 'Checkout',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    testData: 'Promo code: EXPIRED2023',
    expectedResult: 'An inline error "This code has expired" is shown; total is unchanged.',
  },
  {
    title: 'Select a different shipping speed',
    area: 'Checkout',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    testSteps:
      '1. At checkout, open shipping options.\n2. Select "One-Day Shipping".',
    expectedResult: 'Shipping cost and estimated delivery date update accordingly.',
  },
  {
    title: 'Checkout blocked when no shipping address is set',
    area: 'Checkout',
    status: 'Blocked',
    priority: 'High',
    type: 'Manual',
    preconditions: 'New account with no saved address.',
    expectedResult:
      'User is prompted to add an address before the "Place order" button is enabled.',
    comments: 'Blocked — address microservice returns 503 in test env. Ticket OPS-220.',
    pinned: false,
  },
  {
    title: 'Place an order using a gift card balance',
    area: 'Checkout',
    status: 'Skipped',
    priority: 'Low',
    type: 'Manual',
    testData: 'Gift card balance: $25.00',
    expectedResult:
      'Gift card balance is applied first and any remainder charges the default card.',
  },
  {
    title: 'Order confirmation page shows correct itemized totals',
    area: 'Checkout',
    status: 'Passed',
    priority: 'High',
    type: 'Automated',
    expectedResult:
      'Confirmation page lists items, subtotal, shipping, tax, and grand total matching the cart.',
  },

  // ── Search ──────────────────────────────────────────────────────────────────
  {
    title: 'Search returns relevant results for a product keyword',
    area: 'Search',
    status: 'Passed',
    priority: 'High',
    type: 'Automated',
    testData: 'Query: "wireless headphones"',
    testSteps: '1. Type "wireless headphones" in the search bar.\n2. Press Enter.',
    expectedResult: 'Results page shows headphone products with the keyword highlighted.',
  },
  {
    title: 'Search autocomplete suggests popular queries',
    area: 'Search',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    testData: 'Partial query: "echo"',
    expectedResult:
      'Dropdown suggests "echo dot", "echo show", etc. within ~300ms.',
  },
  {
    title: 'Filter search results by price range',
    area: 'Search',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    testSteps:
      '1. Search "laptop".\n2. Set price filter $500-$1000.\n3. Apply.',
    expectedResult: 'Only products within the $500-$1000 range are shown.',
  },
  {
    title: 'Sort search results by customer rating',
    area: 'Search',
    status: 'Passed',
    priority: 'Low',
    type: 'Manual',
    expectedResult: 'Results re-order with the highest-rated products first.',
  },
  {
    title: 'Search with no results shows a helpful empty state',
    area: 'Search',
    status: 'Failed',
    priority: 'Medium',
    type: 'Manual',
    testData: 'Query: "asdkjhqwezxc"',
    expectedResult:
      'A "No results found" message with spelling suggestions is shown.',
    comments: 'FAILS — currently shows a blank page instead of the empty state. Bug AMZ-4610.',
    pinned: false,
  },
  {
    title: 'Search respects department/category scope',
    area: 'Search',
    status: 'Skipped',
    priority: 'Low',
    type: 'Manual',
    testSteps:
      '1. Select "Books" in the category dropdown.\n2. Search "python".',
    expectedResult: 'Only book results are returned, not electronics.',
  },
  {
    title: 'Voice search returns results (Alexa app)',
    area: 'Search',
    status: 'Deferred',
    priority: 'Low',
    type: 'Manual',
    expectedResult: 'Spoken query is transcribed and returns matching results.',
    comments: 'Deferred to next sprint — voice harness not ready.',
  },

  // ── Account ─────────────────────────────────────────────────────────────────
  {
    title: 'Sign in with valid credentials',
    area: 'Account',
    status: 'Passed',
    priority: 'Critical',
    type: 'Automated',
    testData: 'Test account: shopper01@example.com',
    testSteps: '1. Open sign-in.\n2. Enter email and password.\n3. Submit.',
    expectedResult: 'User is signed in and redirected to the home page.',
    pinned: false,
  },
  {
    title: 'Sign in fails with an incorrect password',
    area: 'Account',
    status: 'Passed',
    priority: 'High',
    type: 'Automated',
    expectedResult: 'An error "Your password is incorrect" is shown; user stays signed out.',
  },
  {
    title: 'Update the default shipping address',
    area: 'Account',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    testSteps:
      '1. Go to Account > Addresses.\n2. Edit the default address.\n3. Save.',
    expectedResult: 'New address is saved and shown as default at checkout.',
  },
  {
    title: 'Change account password',
    area: 'Account',
    status: 'Passed',
    priority: 'High',
    type: 'Manual',
    expectedResult:
      'Password is updated and the user can sign in with the new password.',
  },
  {
    title: 'View order history',
    area: 'Account',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    expectedResult: 'Past orders are listed newest-first with status and total.',
  },
  {
    title: 'Enable two-step verification',
    area: 'Account',
    status: 'Skipped',
    priority: 'Medium',
    type: 'Manual',
    expectedResult:
      'After enabling 2SV, sign-in prompts for an OTP code.',
  },
  {
    title: 'Account lockout after repeated failed sign-ins',
    area: 'Account',
    status: 'Blocked',
    priority: 'High',
    type: 'Manual',
    testSteps: '1. Enter a wrong password 6 times.',
    expectedResult:
      'Account is temporarily locked and a recovery message is shown.',
    comments: 'Blocked — rate-limiter disabled in test env. Need OPS to enable.',
  },
  {
    title: 'Manage Prime membership settings',
    area: 'Account',
    status: 'Deferred',
    priority: 'Low',
    type: 'Manual',
    expectedResult: 'User can view renewal date and toggle auto-renew.',
  },

  // ── Payments ────────────────────────────────────────────────────────────────
  {
    title: 'Add a new credit card to the wallet',
    area: 'Payments',
    status: 'Passed',
    priority: 'High',
    type: 'Manual',
    testData: 'Card: Mastercard 5555 5555 5555 4444',
    testSteps:
      '1. Go to Account > Payments.\n2. Click "Add a card".\n3. Enter card details and save.',
    expectedResult: 'Card is validated, masked, and listed in the wallet.',
  },
  {
    title: 'Decline an invalid card number',
    area: 'Payments',
    status: 'Passed',
    priority: 'High',
    type: 'Automated',
    testData: 'Card: 1234 5678 9012 3456 (fails Luhn check)',
    expectedResult: 'An inline error "Enter a valid card number" is shown.',
  },
  {
    title: 'Set a default payment method',
    area: 'Payments',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    expectedResult: 'Selected card is marked default and pre-selected at checkout.',
  },
  {
    title: 'Remove a saved payment method',
    area: 'Payments',
    status: 'Passed',
    priority: 'Low',
    type: 'Manual',
    expectedResult: 'Card is removed from the wallet after confirmation.',
  },
  {
    title: 'Payment fails gracefully on bank decline',
    area: 'Payments',
    status: 'Failed',
    priority: 'Critical',
    type: 'Manual',
    testData: 'Test card simulating issuer decline.',
    testSteps: '1. Place an order with the decline test card.',
    expectedResult:
      'A clear "Your payment was declined" message is shown and the order is not created.',
    comments: 'FAILS — order is created in a pending state despite the decline. Bug AMZ-4700. URGENT.',
    pinned: true,
  },
  {
    title: 'Process a refund to the original payment method',
    area: 'Payments',
    status: 'Skipped',
    priority: 'Medium',
    type: 'Manual',
    expectedResult: 'Refund is issued to the original card and reflected in order history.',
  },
  {
    title: 'Pay using Amazon gift card balance only',
    area: 'Payments',
    status: 'Passed',
    priority: 'Medium',
    type: 'Manual',
    testData: 'Gift card balance: $60.00; order total $42.50',
    expectedResult: 'Order is fully paid from the gift card and balance drops to $17.50.',
  },
  {
    title: 'Currency is displayed correctly for the locale',
    area: 'Payments',
    status: 'Deferred',
    priority: 'Low',
    type: 'Manual',
    expectedResult: 'Prices show the correct currency symbol and formatting per locale.',
  },
];

let created = 0;
transaction(() => {
  for (const c of cases) {
    createTestCase({ ...c, assigneeEmail: nextAssignee() }, author);
    created++;
  }
});

console.log(`Seeded ${created} test cases across 5 areas.`);
console.log(`Users available for sign-in: ${users.length}`);
process.exit(0);
