import { describe, expect, it } from 'vitest';
import { checkSplit } from './split';

const ids = ['ben', 'dan'];
const TIGER = 1600; // Tiger Beer × 2 = $16.00

describe('checkSplit', () => {
  it('EQUAL needs nothing typed', () => {
    expect(checkSplit('EQUAL', ids, {}, TIGER)).toEqual({
      entries: [{ participantId: 'ben' }, { participantId: 'dan' }],
      message: '2 people pay the same',
    });
  });

  describe('PERCENT', () => {
    it('70 / 30 adds up to 100% and is sent as basis points', () => {
      expect(
        checkSplit('PERCENT', ids, { ben: '70', dan: '30' }, TIGER),
      ).toEqual({
        entries: [
          { participantId: 'ben', percentBp: 7000 },
          { participantId: 'dan', percentBp: 3000 },
        ],
        message: 'Total 100% ✓',
      });
    });

    it('accepts half percents (33.5 + 66.5)', () => {
      const check = checkSplit(
        'PERCENT',
        ids,
        { ben: '33.5', dan: '66.5' },
        TIGER,
      );
      expect(check.entries).toEqual([
        { participantId: 'ben', percentBp: 3350 },
        { participantId: 'dan', percentBp: 6650 },
      ]);
    });

    it("can't be saved when it doesn't add up to 100%", () => {
      expect(
        checkSplit('PERCENT', ids, { ben: '60', dan: '30' }, TIGER),
      ).toEqual({
        entries: null,
        message: '90%, need 100%',
      });
      expect(
        checkSplit('PERCENT', ids, { ben: '70', dan: '40' }, TIGER).message,
      ).toBe('110%, need 100%');
    });

    it("can't be saved with an empty or wrong box", () => {
      expect(checkSplit('PERCENT', ids, { ben: '70' }, TIGER)).toEqual({
        entries: null,
        message: 'Type a percent for everyone',
      });
      expect(
        checkSplit('PERCENT', ids, { ben: 'most', dan: '30' }, TIGER).entries,
      ).toBeNull();
    });
  });

  describe('SHARES', () => {
    it('2 : 1 is sent as whole shares', () => {
      expect(checkSplit('SHARES', ids, { ben: '2', dan: '1' }, TIGER)).toEqual({
        entries: [
          { participantId: 'ben', shares: 2 },
          { participantId: 'dan', shares: 1 },
        ],
        message: 'Shares 2 : 1',
      });
    });

    it.each(['0', '', '1.5', '101', 'two'])('rejects a share of %j', (text) => {
      expect(checkSplit('SHARES', ids, { ben: text, dan: '1' }, TIGER)).toEqual(
        {
          entries: null,
          message: 'Each share is a number from 1 to 100',
        },
      );
    });
  });

  describe('EXACT', () => {
    it('amounts typed in dollars must add up to the item, and are sent as cents', () => {
      expect(
        checkSplit('EXACT', ids, { ben: '10', dan: '6.00' }, TIGER),
      ).toEqual({
        entries: [
          { participantId: 'ben', exactCents: 1000 },
          { participantId: 'dan', exactCents: 600 },
        ],
        message: 'Total $16.00 ✓',
      });
    });

    it('lets one person pay nothing', () => {
      expect(
        checkSplit('EXACT', ids, { ben: '16', dan: '0' }, TIGER).entries,
      ).toEqual([
        { participantId: 'ben', exactCents: 1600 },
        { participantId: 'dan', exactCents: 0 },
      ]);
    });

    it("can't be saved when it doesn't add up to the price", () => {
      expect(checkSplit('EXACT', ids, { ben: '10', dan: '5' }, TIGER)).toEqual({
        entries: null,
        message: '$15.00, need $16.00',
      });
    });

    it("can't be saved with an empty box", () => {
      expect(checkSplit('EXACT', ids, { ben: '10' }, TIGER)).toEqual({
        entries: null,
        message: 'Type an amount for everyone',
      });
    });
  });
});
