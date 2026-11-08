import { Injectable } from '@nestjs/common';
import { assertWholeNonNegative, billTotals } from './money.js';

// How one item is shared between the people who claimed it
export type SplitMode = 'EQUAL' | 'SHARES' | 'PERCENT' | 'EXACT';

export interface SplitItem {
  id: string;
  unitPriceCents: number;
  quantity: number;
  splitMode?: SplitMode;
}

export interface SplitClaim {
  itemId: string;
  participantId: string;
  shares: number;
  percentBp?: number | null;
  exactCents?: number | null;
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

// BigInt (whole numbers with no size limit) is used for the weights, because
// the LCM scale can make them bigger than normal numbers hold exactly.
function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b);
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}

// Largest remainder: split amountCents in proportion to the weights so the
// pieces always add up to amountCents exactly.
// 1. Give everyone the floor of their exact share.
// 2. Hand the cents left over, one each, to the largest fractional parts
//    (ties go to the smaller id, so the result is always the same).
export function allocate(
  amountCents: number,
  weights: Map<string, number | bigint>,
): Map<string, number> {
  // BigInt() throws a RangeError on decimals, so bad input cannot slip through
  const amount = BigInt(amountCents);
  const bigWeights = [...weights].map(([id, w]) => ({ id, w: BigInt(w) }));
  const totalWeight = bigWeights.reduce((a, { w }) => a + w, 0n);
  const result = new Map<string, number>();

  if (totalWeight === 0n) {
    if (amount !== 0n) {
      throw new RangeError('Cannot allocate cents when every weight is 0');
    }
    for (const { id } of bigWeights) result.set(id, 0);
    return result;
  }

  const remainders: { id: string; remainder: bigint }[] = [];
  let given = 0n;
  for (const { id, w } of bigWeights) {
    const scaled = amount * w;
    // BigInt division already rounds down for whole numbers >= 0
    const share = scaled / totalWeight;
    // share is never more than amountCents, so it fits back into a number
    result.set(id, Number(share));
    given += share;
    // Integer remainder, so fractions are compared without floats
    remainders.push({ id, remainder: scaled % totalWeight });
  }

  remainders.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  const leftover = Number(amount - given);
  for (let i = 0; i < leftover; i++) {
    const id = remainders[i].id;
    result.set(id, result.get(id)! + 1);
  }
  return result;
}

// KAN-74 stub (TDD red): the tests are written first, against these empty functions
export function checkItemSplit(_item: SplitItem, _claims: SplitClaim[]): void {
  throw new Error('Not implemented yet');
}

export function itemPortions(
  _item: SplitItem,
  _claims: SplitClaim[],
): Map<string, number> {
  throw new Error('Not implemented yet');
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
    let scale = 1n;
    for (const itemClaims of claimsByItem.values()) {
      const totalShares = itemClaims.reduce((a, c) => a + c.shares, 0);
      if (totalShares > 0) scale = lcm(scale, BigInt(totalShares));
    }

    // Each person's weight = their exact items subtotal x scale
    const weights = new Map<string, bigint>([[ownerParticipantId, 0n]]);
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
          weights.get(ownerParticipantId)! + BigInt(lineCents) * scale,
        );
        continue;
      }

      const totalShares = itemClaims.reduce((a, c) => a + c.shares, 0);
      for (const claim of itemClaims) {
        // Exact: scale is a multiple of totalShares, so this divides evenly
        const weight =
          (BigInt(lineCents) * BigInt(claim.shares) * scale) /
          BigInt(totalShares);
        weights.set(
          claim.participantId,
          (weights.get(claim.participantId) ?? 0n) + weight,
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
