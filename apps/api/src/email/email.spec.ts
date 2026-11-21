import { createEmailService } from './email.factory.js';
import { FakeEmailService } from './fake-email.service.js';
import { SmtpEmailService } from './smtp-email.service.js';

const email = { to: 'chee@example.com', subject: 'Hi', text: 'A link' };
const smtpEnv = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_USER: 'splitlah@gmail.com',
  SMTP_PASS: 'app-password',
  APP_URL: 'https://splitlah.duckdns.org',
};

describe('createEmailService', () => {
  it('uses the fake sender when EMAIL_PROVIDER is not set', () => {
    expect(createEmailService({}).provider).toBe('fake');
  });

  it('uses SMTP when asked, ignoring case and spaces', () => {
    const service = createEmailService({
      ...smtpEnv,
      EMAIL_PROVIDER: ' SMTP ',
    });
    expect(service.provider).toBe('smtp');
  });

  it.each(['SMTP_USER', 'SMTP_PASS', 'APP_URL'])(
    'stops at startup when %s is missing for smtp',
    (name) => {
      expect(() => createEmailService({ ...smtpEnv, [name]: '' })).toThrow(
        `${name} is required when EMAIL_PROVIDER=smtp`,
      );
    },
  );

  it('rejects an unknown provider', () => {
    expect(() => createEmailService({ EMAIL_PROVIDER: 'pigeon' })).toThrow(
      'EMAIL_PROVIDER must be fake or smtp (got "pigeon")',
    );
  });
});

describe('FakeEmailService', () => {
  it('keeps each email so a test can read it', async () => {
    const fake = new FakeEmailService();
    await fake.send(email);
    expect(fake.sent).toEqual([email]);
  });
});

describe('SmtpEmailService', () => {
  it('sends the email from the configured address', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await new SmtpEmailService(sendMail, 'SplitLah <a@b.c>').send(email);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SplitLah <a@b.c>',
      ...email,
    });
  });

  it('passes a failed send on to the caller', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('auth failed'));
    await expect(
      new SmtpEmailService(sendMail, 'x').send(email),
    ).rejects.toThrow('auth failed');
  });
});
