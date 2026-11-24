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
  date?: string; // the bill's day, "2026-11-24T00:00:00.000Z"
  createdAt?: string;
  pinnedAt?: string | null; // pinned to the top of My bills (KAN-101)
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
  items: SharedItem[];
};

// An item with who claimed it and how it is split between them
export type SharedItem = Item & {
  splitMode: 'EQUAL' | 'PERCENT' | 'SHARES' | 'EXACT';
  claims: {
    participantId: string;
    shares: number;
    percentBp: number | null;
    exactCents: number | null;
  }[];
};

// One person's share of the bill, worked out by the API's split engine
export type PersonShare = {
  participantId: string;
  displayName: string;
  isOwner: boolean;
  itemsCents: number;
  serviceCents: number;
  gstCents: number;
  totalCents: number;
  paid: boolean;
  // Share link only: the PayNow QR text for exactly this person's amount,
  // or null when there is nothing to pay or the owner has no PayNow number
  paynowPayload?: string | null;
};

// GET /bills/:id/summary and /share/:token/summary: what each person owes.
// The people's totals always add up to totalCents.
export type Summary = {
  subtotalCents: number;
  serviceCents: number;
  gstCents: number;
  totalCents: number;
  unclaimedCents: number; // nobody tapped these items, so the owner pays for them
  people: PersonShare[];
  // Share link only: who to pay back, and their PayNow number if they set one
  paynow?: { mobile: string | null; name: string };
};
