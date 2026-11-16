import { useState, type FormEvent } from 'react';
import { formatCents, parseDollars } from '../bills/money';
import type { ItemInput } from '../bills/types';
import { Field } from './Field';
import { plainButton, primaryButton } from './Page';

type Props = {
  item?: ItemInput; // filled in when editing, missing when adding
  onSave: (item: ItemInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

// Name, quantity and price of one item. The price is typed in dollars ("12.5")
// and sent as cents (1250). Same rules as the API's CreateItemDto.
export function ItemForm({ item, onSave, onCancel, onDelete }: Props) {
  const [name, setName] = useState(item?.name ?? '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [price, setPrice] = useState(
    item ? formatCents(item.unitPriceCents).slice(1) : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    const trimmed = name.trim();
    const count = /^\d{1,3}$/.test(quantity.trim()) ? Number(quantity) : 0;
    const cents = parseDollars(price);
    if (trimmed.length < 1 || trimmed.length > 80)
      found.name = 'Enter a name (up to 80 characters)';
    if (count < 1) found.quantity = '1 to 999';
    if (!cents) found.price = 'A price like 12.50';
    setErrors(found);
    if (Object.keys(found).length === 0)
      onSave({
        name: trimmed,
        quantity: count,
        unitPriceCents: cents as number,
      });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3 glass rounded-[28px] p-4"
    >
      <Field
        label="Item"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Quantity"
          name="quantity"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
        />
        <Field
          label="Price each ($)"
          name="price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`${primaryButton} flex-1`}>
          Save item
        </button>
        <button type="button" onClick={onCancel} className={plainButton}>
          Cancel
        </button>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="h-11 font-medium text-danger"
        >
          Delete item
        </button>
      )}
    </form>
  );
}
