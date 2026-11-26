// Which app feature each source file belongs to, so the QA page can show
// coverage per feature across both apps (KAN-102). The API is split by feature
// already (one NestJS module each); the web app keeps pages and components in
// folders by type, so its files are listed here by name.
import { total } from './lcov.ts';
import type { Coverage, FileCoverage } from './lcov.ts';

export type App = 'api' | 'web';
type Feature = { name: string; what: string; api: string[]; web: string[] };

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
  },
  {
    name: 'Split maths',
    what: 'Service charge, GST, rounding to the cent',
    api: ['src/split/'],
    web: ['src/bills/split.ts', 'src/bills/money.ts'],
  },
  {
    name: 'Receipt scanning',
    what: 'Gemini OCR, daily AI cap, photo upload',
    api: ['src/ocr/', 'src/receipts/'],
    web: ['src/pages/ScanReceipt.tsx', 'src/bills/image.ts'],
  },
  {
    name: 'PayNow',
    what: 'PayNow QR for each person',
    api: ['src/payments/'],
    web: ['src/components/PayNowCard.tsx'],
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
  },
  {
    name: 'App shell',
    what: 'Start-up, config, errors, logging, health, database, API client, layout',
    api: ['src/app.', 'src/common/', 'src/health/', 'src/prisma/'],
    web: [
      'src/App.tsx',
      'src/routes.tsx',
      'src/api/',
      'src/components/Field.tsx',
      'src/components/FormError.tsx',
      'src/components/HomeTabs.tsx',
      'src/components/Logo.tsx',
      'src/components/Page.tsx',
    ],
  },
];

// A file no feature lists shows as Other on the page, so a new file is never
// left out of the numbers without anyone seeing it
export const OTHER = 'Other';

export function featureOf(app: App, file: string): string {
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
