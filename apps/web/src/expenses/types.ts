// What the expenses API sends back (docs/api.md, Expenses)

export const CATEGORIES = {
  FOOD_DRINKS: { label: 'Food & drinks', icon: '🍜' },
  GROCERIES: { label: 'Groceries', icon: '🛒' },
  TRANSPORT: { label: 'Transport', icon: '🚇' },
  SHOPPING: { label: 'Shopping', icon: '🛍️' },
  GIFTS: { label: 'Gifts', icon: '🎁' },
  ENTERTAINMENT: { label: 'Entertainment', icon: '🎬' },
  BILLS_UTILITIES: { label: 'Bills & utilities', icon: '💡' },
  HEALTH: { label: 'Health', icon: '💊' },
  TRAVEL: { label: 'Travel', icon: '✈️' },
  OTHERS: { label: 'Others', icon: '📦' },
} as const;

export type Category = keyof typeof CATEGORIES;
export type Source = 'BILL_SHARE' | 'MANUAL' | 'RECEIPT';

export const SOURCE_LABELS: Record<Source, string> = {
  BILL_SHARE: 'Split bill',
  RECEIPT: 'Receipt',
  MANUAL: 'Manual',
};

export type Expense = {
  id: string;
  amountCents: number;
  category: Category;
  merchant: string | null;
  note: string | null;
  spentAt: string;
  source: Source;
  billId: string | null;
};

export type ExpensePage = {
  month: string;
  totalCount: number;
  items: Expense[];
};

export type MonthSummary = {
  month: string;
  totalCents: number;
  byCategory: { category: Category; totalCents: number; count: number }[];
};

// POST /expenses/receipt: a draft to check, nothing is saved yet
export type ExpenseDraft = {
  amountCents: number;
  merchant: string | null;
  category: Category;
  spentAt: string | null;
};
