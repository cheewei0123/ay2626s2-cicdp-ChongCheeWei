import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetSplitDto } from './set-split.dto.js';

// Does what ValidationPipe does: build the DTO, then run every rule
async function messages(body: object) {
  const errors = await validate(plainToInstance(SetSplitDto, body));
  const collect = (e: (typeof errors)[number]): string[] => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap(collect),
  ];
  return errors.flatMap(collect);
}

const two = (a: object, b: object) => [
  { participantId: 'ben', ...a },
  { participantId: 'dan', ...b },
];

describe('SetSplitDto and the @ValidSplitEntries custom rule', () => {
  it.each([
    ['EQUAL with just the names', { splitMode: 'EQUAL', entries: two({}, {}) }],
    [
      'SHARES 2:1',
      { splitMode: 'SHARES', entries: two({ shares: 2 }, { shares: 1 }) },
    ],
    [
      'PERCENT 70/30',
      {
        splitMode: 'PERCENT',
        entries: two({ percentBp: 7000 }, { percentBp: 3000 }),
      },
    ],
    [
      'EXACT (the price is checked later, in the service)',
      {
        splitMode: 'EXACT',
        entries: two({ exactCents: 1 }, { exactCents: 2 }),
      },
    ],
  ])('accepts %s', async (_case, body) => {
    expect(await messages(body)).toEqual([]);
  });

  it.each([
    [
      'percentages that add up to 90%',
      {
        splitMode: 'PERCENT',
        entries: two({ percentBp: 6000 }, { percentBp: 3000 }),
      },
      'Percentages add up to 90%, need 100%',
    ],
    [
      'a PERCENT entry without percentBp',
      { splitMode: 'PERCENT', entries: two({ percentBp: 10000 }, {}) },
      'Every entry needs percentBp when splitMode is PERCENT',
    ],
    [
      'a SHARES entry without shares',
      { splitMode: 'SHARES', entries: two({ shares: 1 }, {}) },
      'Every entry needs shares when splitMode is SHARES',
    ],
    [
      'the same person twice',
      {
        splitMode: 'EQUAL',
        entries: [{ participantId: 'ben' }, { participantId: 'ben' }],
      },
      'Each person can only appear once in entries',
    ],
    [
      'an unknown mode',
      { splitMode: 'HALF', entries: two({}, {}) },
      'splitMode must be one of EQUAL, SHARES, PERCENT, EXACT',
    ],
    [
      'no entries',
      { splitMode: 'EQUAL', entries: [] },
      'entries must list everyone on this item',
    ],
    [
      'a decimal percentage',
      {
        splitMode: 'PERCENT',
        entries: two({ percentBp: 70.5 }, { percentBp: 29.5 }),
      },
      'percentBp must be an integer number',
    ],
  ])('rejects %s', async (_case, body, message) => {
    expect(await messages(body)).toContain(message);
  });
});
