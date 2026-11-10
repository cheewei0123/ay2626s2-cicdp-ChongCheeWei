// @Type() needs this; Nest loads it when the app starts, but this test imports the DTO alone
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExpenseDto, ListExpensesQueryDto } from './expense.dto.js';

// Does what ValidationPipe does: turn the JSON into the DTO class, then check the rules
async function messages<T extends object>(cls: new () => T, body: object) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateExpenseDto', () => {
  const valid = {
    amountCents: 720,
    category: 'FOOD_DRINKS',
    spentAt: '2026-11-05',
  };

  it('accepts an amount, a category and a date', async () => {
    expect(await messages(CreateExpenseDto, valid)).toEqual([]);
  });

  it.each([
    [
      { amountCents: 0 },
      'amountCents must be a whole number of cents, 1 to 100000000',
    ],
    [
      { amountCents: 100_000_001 },
      'amountCents must be a whole number of cents, 1 to 100000000',
    ],
    [
      { category: 'FOOD' },
      'category must be one of: FOOD_DRINKS, GROCERIES, TRANSPORT, SHOPPING, GIFTS, ENTERTAINMENT, BILLS_UTILITIES, HEALTH, TRAVEL, OTHERS',
    ],
    [
      { spentAt: '5 Nov' },
      'spentAt must be a date like 2026-11-05 or 2026-11-05T19:30:00+08:00',
    ],
    [{ source: 'BILL_SHARE' }, 'source must be MANUAL or RECEIPT'],
  ])('rejects %o', async (change, message) => {
    expect(await messages(CreateExpenseDto, { ...valid, ...change })).toContain(
      message,
    );
  });
});

describe('ListExpensesQueryDto', () => {
  it('turns the query text "2" into the number 2', () => {
    const query = plainToInstance(ListExpensesQueryDto, {
      page: '2',
      pageSize: '10',
    });
    expect(query).toMatchObject({ page: 2, pageSize: 10 });
  });

  it.each([
    [{ month: '2026-13' }, 'month must look like 2026-11'],
    [{ page: '0' }, 'page must be a whole number from 1'],
    [{ pageSize: '101' }, 'pageSize must be 1 to 100'],
  ])('rejects %o', async (query, message) => {
    expect(await messages(ListExpensesQueryDto, query)).toContain(message);
  });
});
