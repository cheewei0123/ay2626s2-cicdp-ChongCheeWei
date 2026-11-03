import { Injectable } from '@nestjs/common';

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

export function allocate(
  _amountCents: number,
  _weights: Map<string, number>,
): Map<string, number> {
  throw new Error('Not implemented');
}

@Injectable()
export class SplitService {
  split(_input: SplitInput): SplitResult {
    throw new Error('Not implemented');
  }
}
