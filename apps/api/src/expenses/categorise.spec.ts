import { merchantKey, ruleCategory } from './categorise.js';

describe('merchantKey', () => {
  it('ignores case, punctuation and extra spaces', () => {
    expect(merchantKey('  STARBUCKS Coffee! ')).toBe('starbucks coffee');
    expect(merchantKey("McDonald's @ Bugis")).toBe('mcdonald s bugis');
    expect(merchantKey('!!!')).toBe('');
  });
});

describe('ruleCategory (works with Gemini switched off)', () => {
  it.each([
    ['Grab Ride', 'TRANSPORT'],
    ['NTUC FairPrice Xtra', 'GROCERIES'],
    ['Guardian Pharmacy', 'HEALTH'],
    ['Singtel bill', 'BILLS_UTILITIES'],
    ['Golden Village', 'ENTERTAINMENT'],
    ['Shopee', 'SHOPPING'],
    ['Scoot', 'TRAVEL'],
    ["McDonald's", 'FOOD_DRINKS'],
    ['Old Airport Road kopitiam', 'FOOD_DRINKS'],
  ])('%s is %s', (merchant, category) => {
    expect(ruleCategory(merchant)).toBe(category);
  });

  it('matches whole words only, and knows nothing about unknown shops', () => {
    expect(ruleCategory('Business Centre')).toBeUndefined(); // not "bus"
    expect(ruleCategory('Ah Huat Trading')).toBeUndefined();
  });
});
