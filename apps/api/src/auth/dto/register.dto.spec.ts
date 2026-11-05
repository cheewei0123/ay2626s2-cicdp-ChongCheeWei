import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';
import { RegisterDto } from './register.dto.js';

// Does what ValidationPipe does: turn the JSON into the DTO class, then check the rules
async function check<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto);
  return {
    dto,
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

const valid = {
  email: 'chee@example.com',
  password: 'correct horse',
  displayName: 'Chee',
};

describe('RegisterDto', () => {
  it('accepts a valid body', async () => {
    expect((await check(RegisterDto, valid)).messages).toEqual([]);
  });

  it('trims and lower-cases the email, and trims the name', async () => {
    const { dto } = await check(RegisterDto, {
      ...valid,
      email: '  Chee@Example.COM ',
      displayName: '  Chee  ',
    });
    expect(dto.email).toBe('chee@example.com');
    expect(dto.displayName).toBe('Chee');
  });

  it.each([
    [{ email: 'not-an-email' }, 'email must be a valid email address'],
    [{ password: 'short' }, 'password must be at least 8 characters'],
    [{ password: 'x'.repeat(129) }, 'password must be at most 128 characters'],
    [{ displayName: '   ' }, 'displayName must be 1 to 50 characters'],
    [
      { paynowMobile: '+6512345678' },
      'paynowMobile must be a Singapore mobile number like +6591234567',
    ],
  ])('rejects %o', async (change, message) => {
    expect(
      (await check(RegisterDto, { ...valid, ...change })).messages,
    ).toContain(message);
  });

  it('accepts a Singapore mobile starting with 8 or 9', async () => {
    for (const paynowMobile of ['+6581234567', '+6591234567']) {
      expect(
        (await check(RegisterDto, { ...valid, paynowMobile })).messages,
      ).toEqual([]);
    }
  });

  it('leaves a non-text email for the validator to reject', async () => {
    expect(
      (await check(RegisterDto, { ...valid, email: 123 })).messages,
    ).toContain('email must be a valid email address');
  });
});

describe('LoginDto', () => {
  it('lower-cases the email', async () => {
    const { dto, messages } = await check(LoginDto, {
      email: 'Chee@Example.com',
      password: 'x',
    });
    expect(messages).toEqual([]);
    expect(dto.email).toBe('chee@example.com');
  });

  it('requires a password', async () => {
    expect(
      (await check(LoginDto, { email: 'chee@example.com', password: '' }))
        .messages,
    ).toContain('password is required');
  });
});
