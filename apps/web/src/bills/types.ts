// What the API sends for bills (see docs/api.md). Amounts are whole cents.

export type Item = {
  id: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
};

// What a person fills in for an item, before it has an id
export type ItemInput = Omit<Item, 'id'>;

export type Bill = {
  id: string;
  title: string;
  status: 'OPEN' | 'LOCKED' | 'SETTLED';
  serviceBp: number; // basis points: 1000 = 10%
  gstBp: number;
  items: Item[];
  // Worked out by the API (service first, then GST), so the maths lives in one place
  totals: {
    subtotalCents: number;
    serviceCents: number;
    gstCents: number;
    totalCents: number;
  };
};

// POST /bills/:id/receipt: what the AI read. A draft; nothing is saved yet.
export type ReceiptDraft = {
  items: ItemInput[];
  serviceBp: number;
  gstBp: number;
  check: { receiptTotalCents: number | null };
};
