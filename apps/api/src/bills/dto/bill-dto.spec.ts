import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBillDto, UpdateBillDto } from './bill.dto.js';
import { CreateItemDto, UpdateItemDto } from './item.dto.js';

// Does what ValidationPipe does: turn the JSON into the DTO class, then check the rules
async function messages<T extends object>(cls: new () => T, body: object) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateBillDto', () => {
  it('needs only a title', async () => {
    expect(await messages(CreateBillDto, { title: 'Dinner' })).toEqual([]);
  });

  it.each([
    [{ title: '' }, 'title must be 1 to 80 characters'],
    [
      { title: 'Dinner', serviceBp: -1 },
      'serviceBp must be between 0 and 10000',
    ],
    [{ title: 'Dinner', gstBp: 10001 }, 'gstBp must be between 0 and 10000'],
    [
      { title: 'Dinner', gstBp: 9.5 },
      'gstBp must be a whole number of basis points',
    ],
    [{ title: 'Dinner', date: '5 Nov' }, 'date must be a date like 2026-11-05'],
  ])('rejects %o', async (body, message) => {
    expect(await messages(CreateBillDto, body)).toContain(message);
  });
});

describe('UpdateBillDto', () => {
  it('allows changing just one field', async () => {
    expect(await messages(UpdateBillDto, { serviceBp: 0 })).toEqual([]);
  });

  it('still checks the rules on fields that are sent', async () => {
    expect(await messages(UpdateBillDto, { title: '' })).toContain(
      'title must be 1 to 80 characters',
    );
  });
});

describe('CreateItemDto', () => {
  const valid = { name: 'Laksa', unitPriceCents: 750, quantity: 1 };

  it('accepts a valid item', async () => {
    expect(await messages(CreateItemDto, valid)).toEqual([]);
  });

  it('defaults to a quantity of 1', async () => {
    expect(
      plainToInstance(CreateItemDto, { name: 'Laksa', unitPriceCents: 750 })
        .quantity,
    ).toBe(1);
  });

  it.each([
    [0, 'unitPriceCents must be at least 1'],
    [-100, 'unitPriceCents must be at least 1'],
    [1.5, 'unitPriceCents must be a whole number of cents'],
    [10_000_001, 'unitPriceCents must be at most 10000000'],
  ])('rejects a price of %s', async (unitPriceCents, message) => {
    expect(
      await messages(CreateItemDto, { ...valid, unitPriceCents }),
    ).toContain(message);
  });

  it.each([
    [{ quantity: 0 }, 'quantity must be 1 to 999'],
    [{ name: 'x'.repeat(81) }, 'name must be 1 to 80 characters'],
  ])('rejects %o', async (change, message) => {
    expect(await messages(CreateItemDto, { ...valid, ...change })).toContain(
      message,
    );
  });
});

describe('UpdateItemDto', () => {
  it('allows changing just the price', async () => {
    expect(await messages(UpdateItemDto, { unitPriceCents: 650 })).toEqual([]);
  });

  it('still rejects a zero price', async () => {
    expect(await messages(UpdateItemDto, { unitPriceCents: 0 })).toContain(
      'unitPriceCents must be at least 1',
    );
  });
});
