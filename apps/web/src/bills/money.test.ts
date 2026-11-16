import { describe, expect, it } from 'vitest';
import {
  formatCents,
  formatPercent,
  parseDollars,
  parsePercent,
} from './money';

describe('parseDollars', () => {
  it.each([
    ['12.5', 1250], // the ticket's example
    ['12.50', 1250],
    ['12', 1200],
    ['$6', 600],
    [' 7.50 ', 750],
    ['0.05', 5],
    ['0.5', 50],
    ['19.99', 1999], // 19.99 * 100 is 1998.9999999999998 as a decimal number
    ['1.15', 115], // 1.15 * 100 is 114.99999999999999
    ['999999.99', 99999999],
  ])('%s → %i cents', (text, cents) => {
    expect(parseDollars(text)).toBe(cents);
  });

  it.each(['', 'abc', '12.345', '-5', '1,200', '12.', '.5', '1e3', '1234567'])(
    'rejects %j',
    (text) => {
      expect(parseDollars(text)).toBeNull();
    },
  );
});

describe('formatCents', () => {
  it.each([
    [1250, '$12.50'],
    [600, '$6.00'],
    [5, '$0.05'],
    [0, '$0.00'],
    [3537, '$35.37'],
  ])('%i → %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('gives back what parseDollars read', () => {
    for (const cents of [1, 99, 100, 1999, 123456]) {
      expect(parseDollars(formatCents(cents))).toBe(cents);
    }
  });
});

describe('percent and basis points', () => {
  it('reads a rate as basis points', () => {
    expect(parsePercent('10')).toBe(1000);
    expect(parsePercent('9%')).toBe(900);
    expect(parsePercent('7.5')).toBe(750);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('100')).toBe(10000);
  });

  it('rejects more than 100% and things that are not numbers', () => {
    expect(parsePercent('100.01')).toBeNull();
    expect(parsePercent('ten')).toBeNull();
  });

  it('shows basis points as a percent', () => {
    expect(formatPercent(1000)).toBe('10');
    expect(formatPercent(750)).toBe('7.5');
  });
});
