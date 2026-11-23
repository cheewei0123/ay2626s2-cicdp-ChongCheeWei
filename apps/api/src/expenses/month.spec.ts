import {
  currentMonth,
  dayRange,
  daysIn,
  monthRange,
  singaporeDate,
} from './month.js';

describe('monthRange (Singapore time, UTC+8)', () => {
  it('starts at midnight on the 1st in Singapore, which is 4pm the day before in UTC', () => {
    expect(monthRange('2026-11')).toEqual({
      start: new Date('2026-10-31T16:00:00.000Z'),
      end: new Date('2026-11-30T16:00:00.000Z'),
    });
  });

  it('puts 11pm on 30 Nov (Singapore) in November, and midnight 1 Dec in December', () => {
    const { start, end } = monthRange('2026-11');
    const lateNov = new Date('2026-11-30T23:00:00+08:00');
    const midnightDec = new Date('2026-12-01T00:00:00+08:00');

    expect(lateNov >= start && lateNov < end).toBe(true);
    expect(midnightDec < end).toBe(false); // the end is not included
    expect(monthRange('2026-12').start).toEqual(midnightDec);
  });

  it('rolls December over into January of the next year', () => {
    expect(monthRange('2026-12').end).toEqual(
      new Date('2026-12-31T16:00:00.000Z'),
    );
  });
});

describe('currentMonth', () => {
  it('uses the Singapore date, not the UTC date', () => {
    // 00:30 on 1 Dec in Singapore is still 30 Nov in UTC
    expect(currentMonth(new Date('2026-11-30T16:30:00.000Z'))).toBe('2026-12');
    expect(currentMonth(new Date('2026-11-30T15:59:00.000Z'))).toBe('2026-11');
  });
});

describe('dayRange, daysIn and singaporeDate (KAN-94)', () => {
  it('covers whole Singapore days, both ends included', () => {
    expect(dayRange('2026-11-03', '2026-11-09')).toEqual({
      start: new Date('2026-11-02T16:00:00.000Z'), // 3 Nov 00:00 SGT
      end: new Date('2026-11-09T16:00:00.000Z'), // 10 Nov 00:00 SGT, not included
    });
    expect(daysIn('2026-11-03', '2026-11-09')).toBe(7);
    expect(daysIn('2026-11-03', '2026-11-03')).toBe(1);
    expect(daysIn('2026-11-09', '2026-11-03')).toBeLessThan(1);
  });

  it('gives the Singapore date, not the UTC date', () => {
    expect(singaporeDate(new Date('2026-11-30T16:30:00.000Z'))).toBe(
      '2026-12-01',
    );
    expect(singaporeDate(new Date('2026-11-30T15:59:00.000Z'))).toBe(
      '2026-11-30',
    );
  });
});
