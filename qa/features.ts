// Which app feature each source file and test belongs to, so the QA page can
// show coverage and tests per feature across both apps (KAN-102, KAN-103). The
// API is split by feature already (one NestJS module each); the web app keeps
// pages and components in folders by type, so its files are listed by name.
// API end-to-end test files are listed under `e2e`; browser tests carry a
// Playwright tag (`@bills`) for each feature their journey goes through.
import { total } from './lcov.ts';
import type { Coverage, FileCoverage } from './lcov.ts';

export type App = 'api' | 'web';
type Feature = {
  name: string;
  what: string;
  api: string[];
  web: string[];
  e2e: string[];
  tag: string;
};

// A path ending in / is a folder; anything else is a file or a file name start.
// The longest match wins, so src/bills/split.ts is Split maths, not Bills.
export const FEATURES: Feature[] = [
  {
    name: 'Bills',
    what: 'Create, edit, share, join, claim items, summary, My bills',
    api: ['src/bills/'],
    web: [
      'src/bills/',
      'src/pages/NewBill.tsx',
      'src/pages/EditBill.tsx',
      'src/pages/MyBills.tsx',
      'src/pages/Share.tsx',
      'src/pages/JoinCode.tsx',
      'src/pages/GuestBill.tsx',
      'src/pages/Summary.tsx',
      'src/components/AdjustSplit.tsx',
      'src/components/BillActions.tsx',
      'src/components/ChargeRow.tsx',
      'src/components/ItemForm.tsx',
      'src/components/PersonCard.tsx',
      'src/components/SummaryView.tsx',
      'src/components/SwipeRow.tsx',
    ],
    e2e: ['test/bills', 'test/claims', 'test/share', 'test/summary'],
    tag: '@bills',
  },
  {
    name: 'Split maths',
    what: 'Service charge, GST, rounding to the cent',
    api: ['src/split/'],
    web: ['src/bills/split.ts', 'src/bills/money.ts'],
    e2e: ['test/split-modes'],
    tag: '@split',
  },
  {
    name: 'Receipt scanning',
    what: 'Gemini OCR, daily AI cap, photo upload',
    api: ['src/ocr/', 'src/receipts/'],
    web: ['src/pages/ScanReceipt.tsx', 'src/bills/image.ts'],
    e2e: ['test/receipts', 'test/ai-quota'],
    tag: '@receipts',
  },
  {
    name: 'PayNow',
    what: 'PayNow QR for each person',
    api: ['src/payments/'],
    web: ['src/components/PayNowCard.tsx', 'src/bills/paynow'],
    e2e: ['test/payments'],
    tag: '@paynow',
  },
  {
    name: 'Expenses',
    what: 'Expense list, categories, charts, date range',
    api: ['src/expenses/'],
    web: [
      'src/expenses/',
      'src/pages/AddExpense.tsx',
      'src/pages/Expenses.tsx',
      'src/components/CategoryBars.tsx',
      'src/components/CategoryPie.tsx',
      'src/components/EditExpense.tsx',
      'src/components/ExpenseFields.tsx',
      'src/components/RangePicker.tsx',
      'src/components/SpendChart.tsx',
      'src/components/SpendOverTime.tsx',
    ],
    e2e: ['test/expenses', 'test/bill-share'],
    tag: '@expenses',
  },
  {
    name: 'Accounts',
    what: 'Register, verify, log in, two-step, Google, passwords, phone check, delete',
    api: ['src/auth/', 'src/email/', 'src/sms/', 'src/telegram/'],
    web: [
      'src/auth/',
      'src/pages/Login.tsx',
      'src/pages/Register.tsx',
      'src/pages/Verify.tsx',
      'src/pages/ForgotPassword.tsx',
      'src/pages/ResetPassword.tsx',
      'src/pages/ChangePassword.tsx',
      'src/pages/Profile.tsx',
      'src/components/AuthLayout.tsx',
      'src/components/DeleteAccount.tsx',
      'src/components/GoogleButton.tsx',
      'src/components/PhoneCheck.tsx',
      'src/components/PhoneField.tsx',
      'src/components/SetPassword.tsx',
      'src/components/TwoStepLogin.tsx',
      'src/components/VerifyBanner.tsx',
    ],
    e2e: [
      'test/auth',
      'test/account-deletion',
      'test/google',
      'test/mfa',
      'test/password',
      'test/phone',
      'test/sessions',
      'test/telegram',
      'test/verify-email',
    ],
    tag: '@accounts',
  },
  {
    name: 'App shell',
    what: 'Start-up, config, errors, logging, health, database, API client, layout',
    api: ['src/app.', 'src/common/', 'src/health/', 'src/prisma/'],
    web: [
      'src/App.tsx',
      'pwa.config.ts',
      'src/routes.tsx',
      'src/api/',
      'src/components/Field.tsx',
      'src/components/FormError.tsx',
      'src/components/HomeTabs.tsx',
      'src/components/Logo.tsx',
      'src/components/Page.tsx',
    ],
    e2e: ['test/app', 'test/health', 'test/cross-cutting'],
    tag: '@app',
  },
];

// A file no feature lists shows as Other on the page, so a new file is never
// left out of the numbers without anyone seeing it
export const OTHER = 'Other';

export function featureOf(app: App | 'e2e', file: string): string {
  let best = { name: OTHER, length: 0 };
  for (const f of FEATURES)
    for (const prefix of f[app])
      if (file.startsWith(prefix) && prefix.length > best.length)
        best = { name: f.name, length: prefix.length };
  return best.name;
}

export function byFeature(
  app: App,
  files: FileCoverage[],
): Map<string, Coverage> {
  const groups = new Map<string, FileCoverage[]>();
  for (const f of files) {
    const name = featureOf(app, f.file);
    groups.set(name, [...(groups.get(name) ?? []), f]);
  }
  return new Map([...groups].map(([name, fs]) => [name, total(fs)]));
}

// A unit test file belongs where the file it tests does:
// src/pages/Login.test.tsx -> src/pages/Login.tsx -> Accounts.
// API end-to-end tests live in test/ and are listed under e2e.
export function testFeature(app: App, file: string): string {
  if (app === 'api' && file.startsWith('test/')) return featureOf('e2e', file);
  return featureOf(app, file.replace(/\.(test|spec)(\.[cm]?[jt]sx?)$/, '$2'));
}

// The features a browser test goes through, from its tags
export const featuresOfTags = (tags: string[]) =>
  FEATURES.filter((f) => tags.includes(f.tag)).map((f) => f.name);
