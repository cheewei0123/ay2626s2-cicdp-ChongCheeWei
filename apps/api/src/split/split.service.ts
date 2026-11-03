import { Injectable } from '@nestjs/common';
import { assertWholeNonNegative, billTotals } from './money.js';

export interface SplitItem {
  id: string;
  unitPriceCents: number;
  quantity: number;
}

export interface SplitClaim {
  itemId: string;
  participantId: string;
  shares: number;
}

export interface SplitInput {
  items: SplitItem[];
  claims: SplitClaim[];
  serviceBp: number;
  gstBp: number;
  ownerParticipantId: string;
}

export interface PersonShare {
  participantId: string;
  itemsCents: number;
  serviceCents: number;
  gstCents: number;
  totalCents: number;
}

export interface SplitResult {
  people: PersonShare[];
  unclaimedCents: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

// Largest remainder: split amountCents in proportion to the weights so the
// pieces always add up to amountCents exactly.
// 1. Give everyone the floor of their exact share.
// 2. Hand the cents left over, one each, to the largest fractional parts
//    (ties go to the smaller id, so the result is always the same).
export function allocate(
  amountCents: number,
  weights: Map<string, number>,
): Map<string, number> {
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  const result = new Map<string, number>();

  if (totalWeight === 0) {
    if (amountCents !== 0) {
      throw new RangeError('Cannot allocate cents when every weight is 0');
    }
    for (const id of weights.keys()) result.set(id, 0);
    return result;
  }

  const remainders: { id: string; remainder: number }[] = [];
  let given = 0;
  for (const [id, weight] of weights) {
    const scaled = amountCents * weight;
    if (!Number.isSafeInteger(scaled)) {
      throw new RangeError('Amount too large to split exactly');
    }
    const share = Math.floor(scaled / totalWeight);
    result.set(id, share);
    given += share;
    // Integer remainder, so fractions are compared without floats
    remainders.push({ id, remainder: scaled % totalWeight });
  }

  remainders.sort(
    (a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id),
  );
  for (let i = 0; i < amountCents - given; i++) {
    const id = remainders[i].id;
    result.set(id, result.get(id)! + 1);
  }
  return result;
}

@Injectable()
export class SplitService {
  split(input: SplitInput): SplitResult {
    const { items, claims, serviceBp, gstBp, ownerParticipantId } = input;

    const claimsByItem = new Map<string, SplitClaim[]>();
    for (const item of items) {
      assertWholeNonNegative(item.unitPriceCents, 'unitPriceCents');
      assertWholeNonNegative(item.quantity, 'quantity');
      claimsByItem.set(item.id, []);
    }
    for (const claim of claims) {
      if (!Number.isInteger(claim.shares) || claim.shares < 1) {
        throw new RangeError(`shares must be a whole number >= 1`);
      }
      const itemClaims = claimsByItem.get(claim.itemId);
      if (!itemClaims) {
        throw new RangeError(`Claim for unknown item ${claim.itemId}`);
      }
      itemClaims.push(claim);
    }

    // Common multiple of every item's total shares, so each person's exact
    // subtotal can be stored as a whole number (scaled up by this factor)
    let scale = 1;
    for (const itemClaims of claimsByItem.values()) {
      const totalShares = itemClaims.reduce((a, c) => a + c.shares, 0);
      if (totalShares > 0) scale = lcm(scale, totalShares);
    }

    // Each person's weight = their exact items subtotal x scale
    const weights = new Map<string, number>([[ownerParticipantId, 0]]);
    let subtotal = 0;
    let unclaimedCents = 0;
    for (const item of items) {
      const lineCents = item.unitPriceCents * item.quantity;
      const itemClaims = claimsByItem.get(item.id)!;
      subtotal += lineCents;

      if (itemClaims.length === 0) {
        // Nobody claimed it: the owner pays, and the UI can warn
        unclaimedCents += lineCents;
        weights.set(
          ownerParticipantId,
          weights.get(ownerParticipantId)! + lineCents * scale,
        );
        continue;
      }

      const totalShares = itemClaims.reduce((a, c) => a + c.shares, 0);
      for (const claim of itemClaims) {
        const weight = (lineCents * claim.shares * scale) / totalShares;
        weights.set(
          claim.participantId,
          (weights.get(claim.participantId) ?? 0) + weight,
        );
      }
    }

    // Bill totals once, exactly as printed on the receipt
    const bill = billTotals(subtotal, serviceBp, gstBp);
    const itemsSplit = allocate(bill.subtotal, weights);
    const serviceSplit = allocate(bill.service, weights);
    const gstSplit = allocate(bill.gst, weights);

    const people = [...weights.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((participantId) => {
        const itemsCents = itemsSplit.get(participantId)!;
        const serviceCents = serviceSplit.get(participantId)!;
        const gstCents = gstSplit.get(participantId)!;
        return {
          participantId,
          itemsCents,
          serviceCents,
          gstCents,
          totalCents: itemsCents + serviceCents + gstCents,
        };
      });

    return { people, unclaimedCents };
  }
}
