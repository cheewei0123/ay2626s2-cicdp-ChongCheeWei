import { ConflictException } from '@nestjs/common';
import type { BillStatus } from '../generated/prisma/client.js';

// A bill can only change while it is OPEN; after locking, the split is final.
// Shared by the owner's routes (items) and the guests' routes (claims).
export function assertOpen(bill: { status: BillStatus }) {
  if (bill.status !== 'OPEN') {
    throw new ConflictException('Bill is locked; unlock it to make changes');
  }
}
