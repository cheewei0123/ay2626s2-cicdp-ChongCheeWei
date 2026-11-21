import { useId } from 'react';
import type { ExpenseErrors, ExpenseForm } from '../expenses/form';
import { CATEGORIES, type Category } from '../expenses/types';
import { Field } from './Field';

type Props = {
  form: ExpenseForm;
  errors: ExpenseErrors;
  onChange: (form: ExpenseForm) => void;
  // A bill share: amount, merchant and date come from the bill
  fromBill?: boolean;
  // Add expense only: guess the category once the merchant is typed
  onMerchantDone?: () => void;
  categoryHint?: string;
};

// The fields for adding or editing an expense, shared by the Add page and the edit sheet
export function ExpenseFields(props: Props) {
  const { form, errors, onChange, fromBill } = props;
  const categoryId = useId();
  const set = (field: keyof ExpenseForm) => (value: string) =>
    onChange({ ...form, [field]: value });

  return (
    <>
      {!fromBill && (
        <Field
          label="Amount ($)"
          name="amount"
          inputMode="decimal"
          placeholder="7.20"
          value={form.amount}
          onChange={(e) => set('amount')(e.target.value)}
          error={errors.amount}
        />
      )}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={categoryId}
          className="px-2 text-sm font-medium text-muted"
        >
          Category
        </label>
        <select
          id={categoryId}
          value={form.category}
          onChange={(e) => set('category')(e.target.value as Category)}
          className="h-14 rounded-full border border-line bg-surface px-5 text-base text-ink backdrop-blur-xl"
        >
          {Object.entries(CATEGORIES).map(([value, c]) => (
            <option key={value} value={value} className="bg-bg">
              {c.icon} {c.label}
            </option>
          ))}
        </select>
        {props.categoryHint && (
          <span className="px-2 text-sm text-muted">{props.categoryHint}</span>
        )}
      </div>
      {!fromBill && (
        <>
          <Field
            label="Merchant"
            name="merchant"
            placeholder="Optional"
            value={form.merchant}
            onChange={(e) => set('merchant')(e.target.value)}
            onBlur={props.onMerchantDone}
          />
          <Field
            label="Date"
            name="date"
            type="date"
            value={form.date}
            onChange={(e) => set('date')(e.target.value)}
            error={errors.date}
          />
        </>
      )}
      <Field
        label="Note"
        name="note"
        placeholder="Optional"
        value={form.note}
        onChange={(e) => set('note')(e.target.value)}
      />
    </>
  );
}
