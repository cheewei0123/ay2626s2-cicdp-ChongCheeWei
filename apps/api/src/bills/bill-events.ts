// Events the bills code sends when something happens. Other modules can listen for them
// without BillsModule knowing they exist (expenses logs each person's share, KAN-79).

export const BILL_LOCKED = 'bill.locked';

export interface BillLockedEvent {
  billId: string;
  merchant: string;
  date: Date;
  // One entry per person with an account. Guests without one are left out.
  shares: { userId: string; amountCents: number }[];
}
