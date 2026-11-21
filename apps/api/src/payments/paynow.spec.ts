import {
  buildPayNowPayload,
  cleanText,
  crc16,
  formatAmount,
  tlv,
} from './paynow.js';

// Reads a TLV string back into { id: value }, so tests check fields, not one long string
function parse(payload: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const length = Number(payload.slice(i + 2, i + 4));
    fields[id] = payload.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return fields;
}

const chee = {
  mobile: '+6591234567',
  amountCents: 720,
  name: 'Chee',
  reference: 'Ali K7P2Q',
};

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE test vector', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('pads to 4 hex characters', () => {
    expect(crc16('')).toBe('FFFF');
    expect(crc16('')).toHaveLength(4);
  });
});

describe('tlv', () => {
  it('writes ID, a 2-digit length and the value', () => {
    expect(tlv('58', 'SG')).toBe('5802SG');
    expect(tlv('60', 'Singapore')).toBe('6009Singapore');
  });

  it('counts the whole nested value', () => {
    const inner = tlv('01', 'abc'); // "0103abc", 7 characters
    expect(tlv('62', inner)).toBe('62070103abc');
  });

  it('rejects a bad id or a value longer than 99', () => {
    expect(() => tlv('5', 'x')).toThrow(RangeError);
    expect(() => tlv('59', 'x'.repeat(100))).toThrow(RangeError);
  });
});

describe('formatAmount', () => {
  it('writes dollars and 2 decimal places', () => {
    expect(formatAmount(720)).toBe('7.20');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(123456)).toBe('1234.56');
  });

  it('rejects part cents and negatives', () => {
    expect(() => formatAmount(1.5)).toThrow(RangeError);
    expect(() => formatAmount(-1)).toThrow(RangeError);
  });
});

describe('cleanText', () => {
  it('drops accents, emoji and extra spaces', () => {
    expect(cleanText('  José   🍜 Tan ')).toBe('Jose Tan');
  });

  it('cuts to 25 characters', () => {
    expect(cleanText('a'.repeat(40))).toHaveLength(25);
  });
});

describe('buildPayNowPayload', () => {
  const payload = buildPayNowPayload(chee);
  const fields = parse(payload);

  it('has every top-level field with the right value', () => {
    expect(fields).toMatchObject({
      '00': '01',
      '01': '12',
      '52': '0000',
      '53': '702',
      '54': '7.20',
      '58': 'SG',
      '59': 'Chee',
      '60': 'Singapore',
    });
  });

  it('puts the PayNow mobile number in tag 26, amount not editable', () => {
    expect(parse(fields['26'])).toEqual({
      '00': 'SG.PAYNOW',
      '01': '0',
      '02': '+6591234567',
      '03': '0',
    });
  });

  it('puts the reference in tag 62', () => {
    expect(parse(fields['62'])).toEqual({ '01': 'Ali K7P2Q' });
  });

  it('ends with a CRC of everything before it', () => {
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('leaves out tag 62 when there is no reference', () => {
    const noRef = parse(buildPayNowPayload({ ...chee, reference: ' ' }));
    expect(noRef['62']).toBeUndefined();
  });

  it('uses "SplitLah" when the name has no usable characters', () => {
    expect(parse(buildPayNowPayload({ ...chee, name: '🍜' }))['59']).toBe(
      'SplitLah',
    );
  });

  it('rejects a number that is not a Singapore mobile', () => {
    for (const mobile of ['91234567', '+6561234567', '+659123456']) {
      expect(() => buildPayNowPayload({ ...chee, mobile })).toThrow(
        'Singapore mobile',
      );
    }
  });

  it('rejects a zero or invalid amount', () => {
    expect(() => buildPayNowPayload({ ...chee, amountCents: 0 })).toThrow(
      'more than 0',
    );
    expect(() => buildPayNowPayload({ ...chee, amountCents: 7.2 })).toThrow(
      RangeError,
    );
  });
});
