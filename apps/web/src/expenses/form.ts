import { formatCents, parseDollars } from '../bills/money';
import { sgDay } from './dates';
import type { Category, Expense } from './types';

// What the expense form holds: text as typed, turned into cents only when saving
export type ExpenseForm = {
  amount: string;
  category: Category;
  merchant: string;
  date: string; // YYYY-MM-DD, from <input type="date">
  note: string;
};

export type ExpenseErrors = Partial<Record<'amount' | 'date', string>>;

export const emptyForm = (): ExpenseForm => ({
  amount: '',
  category: 'FOOD_DRINKS',
  merchant: '',
  date: sgDay(new Date()),
  note: '',
});

export const formOf = (e: Expense): ExpenseForm => ({
  amount: formatCents(e.amountCents).slice(1), // "$7.20" → "7.20"
  category: e.category,
  merchant: e.merchant ?? '',
  date: sgDay(e.spentAt),
  note: e.note ?? '',
});

// Caught on the phone, so a typo never goes to the API
export function validateExpense(form: ExpenseForm): ExpenseErrors {
  const errors: ExpenseErrors = {};
  const cents = parseDollars(form.amount);
  if (cents === null || cents < 1) {
    errors.amount = 'Enter an amount like 7.20';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = 'Pick a date';
  return errors;
}

// The API body. Empty text boxes are left out rather than saved as "".
export function toBody(form: ExpenseForm) {
  return {
    amountCents: parseDollars(form.amount)!,
    category: form.category,
    spentAt: form.date,
    merchant: form.merchant.trim() || undefined,
    note: form.note.trim() || undefined,
  };
}
