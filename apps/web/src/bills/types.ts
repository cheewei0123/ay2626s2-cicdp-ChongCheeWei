// What the API sends for bills (see docs/api.md). Amounts are whole cents.

export type Item = {
  id: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
};

export type Person = { id: string; displayName: string };

// What a person fills in for an item, before it has an id
export type ItemInput = Omit<Item, 'id'>;

export type Bill = {
  id: string;
  title: string;
  status: 'OPEN' | 'LOCKED' | 'SETTLED';
  serviceBp: number; // basis points: 1000 = 10%
  gstBp: number;
  items: Item[];
  shareToken: string; // the secret part of the link friends open
  joinCode: string; // 5 characters, easy to read out at the table
  participants: Person[];
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

// GET /share/:token: the bill as a friend sees it (no private fields)
export type SharedBill = {
  title: string;
  status: Bill['status'];
  owner: { displayName: string };
  participants: Person[];
  items: (Item & { claims: { participantId: string }[] })[];
};

// GET /share/:token/summary: what each person owes
export type Summary = {
  people: { participantId: string; totalCents: number }[];
};
