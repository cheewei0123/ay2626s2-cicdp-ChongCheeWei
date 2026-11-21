import type { Category } from '../generated/prisma/enums.js';

// How a merchant is remembered: lowercase letters, digits and single spaces, so
// "STARBUCKS Coffee!" and "Starbucks  coffee" are the same merchant.
export function merchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The last layer, for when there is no memory and no AI answer (or Gemini is down).
// Checked top to bottom; whole words only, so "bus" doesn't match "business".
const RULES: [RegExp, Category][] = [
  [
    /\b(grab|gojek|tada|comfort|cdg|taxi|mrt|bus|simplygo|ez ?link)\b/,
    'TRANSPORT',
  ],
  [
    /\b(ntuc|fairprice|sheng siong|cold storage|giant|don don donki|redmart)\b/,
    'GROCERIES',
  ],
  [/\b(guardian|watsons|unity|clinic|pharmacy|polyclinic|dental)\b/, 'HEALTH'],
  [/\b(sp group|singtel|starhub|m1|circles|simba)\b/, 'BILLS_UTILITIES'],
  [
    /\b(golden village|gv|shaw|cathay|netflix|spotify|steam)\b/,
    'ENTERTAINMENT',
  ],
  [/\b(uniqlo|shopee|lazada|amazon|ikea|popular|daiso)\b/, 'SHOPPING'],
  [
    /\b(sia|singapore airlines|scoot|jetstar|airasia|agoda|booking|hotel)\b/,
    'TRAVEL',
  ],
  [
    /\b(kopitiam|food ?court|hawker|cafe|coffee|kopi|starbucks|toast box|ya kun|mcdonald s|kfc|restaurant|bakery|bubble tea|koi|liho)\b/,
    'FOOD_DRINKS',
  ],
];

export function ruleCategory(merchant: string): Category | undefined {
  const key = merchantKey(merchant);
  return RULES.find(([pattern]) => pattern.test(key))?.[1];
}
