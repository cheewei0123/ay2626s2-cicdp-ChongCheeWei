// The functional requirements from the report (section 6.1) and the tests that
// prove each one (KAN-103). A test is named by the start of its key:
//   api/test/claims   the API end-to-end file test/claims.e2e-spec.ts
//   api/src/...       an API unit test file
//   web/src/...       a web test file
//   browser/owner     the browser test whose title starts with "owner"
// qa/checks.test.ts checks that every one of these still exists.
import type { Tally, TestCase } from './results.ts';
import { tally } from './results.ts';

export type Requirement = {
  id: string;
  title: string;
  text: string;
  tests: string[];
};

export const REQUIREMENTS: Requirement[] = [
  {
    id: 'FR1',
    title: 'Accounts',
    text: 'Register and log in with email and password or Google; 14-day logins that logout ends; email verified before creating bills',
    tests: [
      'api/test/auth',
      'api/test/google',
      'api/test/sessions',
      'api/test/verify-email',
      'api/src/auth/auth.service',
      'api/src/auth/email-verified.guard',
      'web/src/auth/auth-flow',
      'web/src/auth/google',
      'web/src/auth/verify',
      'browser/owner',
    ],
  },
  {
    id: 'FR2',
    title: 'Bills',
    text: 'Create, view, change and delete own bills with service charge and GST rates; swipe to pin, share or delete with undo',
    tests: [
      'api/test/bills',
      'api/src/bills/bills.service',
      'api/src/bills/guards/bill-owner.guard',
      'web/src/bills/bill-flow',
      'web/src/bills/my-bills',
      'browser/owner',
    ],
  },
  {
    id: 'FR3',
    title: 'Items',
    text: 'The owner adds, edits and deletes items with a name, price and quantity',
    tests: [
      'api/test/bills',
      'api/src/bills/controllers',
      'web/src/bills/bill-flow',
      'browser/owner',
    ],
  },
  {
    id: 'FR4',
    title: 'Receipt scan',
    text: 'A receipt photo becomes a draft of items, charges and total; 20 scans a day; "No receipt found" for other photos',
    tests: [
      'api/test/receipts',
      'api/test/ai-quota',
      'api/src/ocr/gemini-ocr.service',
      'api/src/ocr/ai-quota.guard',
      'api/src/receipts/receipts.service',
      'web/src/bills/bill-flow',
      'browser/owner',
    ],
  },
  {
    id: 'FR5',
    title: 'Share',
    text: 'Each bill has a share link and a 5-character join code; anyone with either joins with a display name',
    tests: [
      'api/test/share',
      'api/src/bills/share.service',
      'api/src/bills/join-code',
      'web/src/bills/guest-flow',
      'browser/guest',
    ],
  },
  {
    id: 'FR6',
    title: 'Claim',
    text: 'Guests claim and unclaim items and change how a shared item is split, until the bill is locked',
    tests: [
      'api/test/claims',
      'api/test/split-modes',
      'api/src/bills/claims.service',
      'api/src/split/split.modes',
      'web/src/bills/adjust-split',
      'web/src/bills/guest-flow',
      'browser/guest',
    ],
  },
  {
    id: 'FR7',
    title: 'Summary',
    text: "Everyone sees each person's items, service charge, GST and total; unclaimed items go to the owner, flagged",
    tests: [
      'api/test/summary',
      'api/src/bills/summary.service',
      'api/src/split/split.service',
      'api/src/split/money',
      'web/src/bills/summary',
      'browser/guest',
    ],
  },
  {
    id: 'FR8',
    title: 'Lock',
    text: 'The owner locks the bill so claims can no longer change, and can unlock it',
    tests: [
      'api/test/claims',
      'api/src/bills/claims.service',
      'web/src/bills/summary',
    ],
  },
  {
    id: 'FR9',
    title: 'Expenses',
    text: 'Expenses by category for a month or any range, as bars, a pie or over time; a locked bill adds each share',
    tests: [
      'api/test/expenses',
      'api/test/bill-share',
      'api/src/expenses/expenses.service',
      'api/src/expenses/categorise',
      'api/src/expenses/bill-share.listener',
      'web/src/expenses/expenses',
      'web/src/expenses/charts',
    ],
  },
  {
    id: 'FR10',
    title: 'Account safety',
    text: 'Reset and change password, two-step login with backup codes, check the PayNow number',
    tests: [
      'api/test/password',
      'api/test/mfa',
      'api/test/phone',
      'api/test/telegram',
      'api/src/auth/password-reset.service',
      'api/src/auth/mfa.service',
      'api/src/auth/phone-verification.service',
      'web/src/auth/password',
      'web/src/auth/mfa',
      'web/src/auth/profile',
    ],
  },
  {
    id: 'FR11',
    title: 'Account deletion',
    text: 'Delete the account with the password (and code); closed at once, wiped after 6 months, friends keep their spending',
    tests: [
      'api/test/account-deletion',
      'api/src/auth/account-deletion.service',
      'web/src/auth/delete-account',
    ],
  },
];

// The results of a requirement's tests in this run
export function checkRequirement(r: Requirement, tests: TestCase[]) {
  const mine = tests.filter((t) =>
    r.tests.some((ref) => t.key.startsWith(ref)),
  );
  const found = r.tests.filter((ref) =>
    tests.some((t) => t.key.startsWith(ref)),
  );
  const result: Tally = tally(mine);
  return { ...result, missing: r.tests.filter((ref) => !found.includes(ref)) };
}
