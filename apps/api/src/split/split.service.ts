import { Injectable } from '@nestjs/common';
import { assertWholeNonNegative, billTotals, formatCents } from './money.js';

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

// 9000 → "90%", 3333 → "33.33%" (basis points, integers only)
export function formatPercent(bp: number): string {
  const rest = bp % 100;
  return `${Math.floor(bp / 100)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}%`;
}

// Items made before KAN-74 have no mode; they keep splitting by shares as before
const modeOf = (item: SplitItem): SplitMode => item.splitMode ?? 'SHARES';

// Checks that an item's claims make sense for its split mode.
// Throws a RangeError with a message a person can act on.
export function checkItemSplit(item: SplitItem, claims: SplitClaim[]): void {
  // Nobody has claimed it yet: the owner pays, so there is no split to check.
  // (Found by the property test: an unclaimed EXACT item "added up to $0.00".)
  if (claims.length === 0) return;
  const mode = modeOf(item);
  const lineCents = item.unitPriceCents * item.quantity;

  if (mode === 'SHARES') {
    for (const c of claims) {
      if (!Number.isInteger(c.shares) || c.shares < 1) {
        throw new RangeError('shares must be a whole number >= 1');
      }
    }
  }

  if (mode === 'PERCENT') {
    let sum = 0;
    for (const c of claims) {
      if (c.percentBp == null) {
        throw new RangeError(
          'Every person on a PERCENT item needs a percentBp',
        );
      }
      assertWholeNonNegative(c.percentBp, 'percentBp');
      sum += c.percentBp;
    }
    if (sum !== 10000) {
      throw new RangeError(
        `Percentages add up to ${formatPercent(sum)}, need 100%`,
      );
    }
  }

  if (mode === 'EXACT') {
    let sum = 0;
    for (const c of claims) {
      if (c.exactCents == null) {
        throw new RangeError(
          'Every person on an EXACT item needs an exactCents',
        );
      }
      assertWholeNonNegative(c.exactCents, 'exactCents');
      sum += c.exactCents;
    }
    if (sum !== lineCents) {
      throw new RangeError(
        `Exact amounts add up to ${formatCents(sum)}, need ${formatCents(lineCents)}`,
      );
    }
  }
}

// Every mode becomes a weight per person; the largest-remainder maths stays the same.
//   EQUAL → 1 each   SHARES → shares   PERCENT → percentBp   EXACT → exactCents
function itemWeights(
  item: SplitItem,
  claims: SplitClaim[],
): Map<string, bigint> {
  checkItemSplit(item, claims);
  const mode = modeOf(item);
  const weightOf = (c: SplitClaim): number =>
    mode === 'EQUAL'
      ? 1
      : mode === 'SHARES'
        ? c.shares
        : mode === 'PERCENT'
          ? c.percentBp!
          : c.exactCents!;
  return new Map(claims.map((c) => [c.participantId, BigInt(weightOf(c))]));
}

// How many cents of this one item each person pays (largest remainder within the item)
export function itemPortions(
  item: SplitItem,
  claims: SplitClaim[],
): Map<string, number> {
  return allocate(
    item.unitPriceCents * item.quantity,
    itemWeights(item, claims),
  );
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
      const itemClaims = claimsByItem.get(claim.itemId);
      if (!itemClaims) {
        throw new RangeError(`Claim for unknown item ${claim.itemId}`);
      }
      itemClaims.push(claim);
    }

    // Each item's weights from its split mode (this also checks the mode's rules)
    const weightsByItem = new Map<string, Map<string, bigint>>();
    for (const item of items) {
      weightsByItem.set(item.id, itemWeights(item, claimsByItem.get(item.id)!));
    }
    const totalOf = (w: Map<string, bigint>) =>
      [...w.values()].reduce((a, b) => a + b, 0n);

    // Common multiple of every item's total weight, so each person's exact
    // subtotal can be stored as a whole number (scaled up by this factor)
    let scale = 1n;
    for (const itemWeight of weightsByItem.values()) {
      const total = totalOf(itemWeight);
      if (total > 0n) scale = lcm(scale, total);
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

      const itemWeight = weightsByItem.get(item.id)!;
      const total = totalOf(itemWeight);
      // Only possible for a $0 EXACT item where everyone typed 0: nothing to share
      if (total === 0n) continue;
      for (const [participantId, w] of itemWeight) {
        // Exact: scale is a multiple of total, so this divides evenly
        const weight = (BigInt(lineCents) * w * scale) / total;
        weights.set(participantId, (weights.get(participantId) ?? 0n) + weight);
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
