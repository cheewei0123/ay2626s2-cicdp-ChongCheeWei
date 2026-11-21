import { createTransport } from 'nodemailer';
import type { EmailService } from './email.interface.js';
import { FakeEmailService } from './fake-email.service.js';
import { SmtpEmailService } from './smtp-email.service.js';

type EmailEnv = {
  EMAIL_PROVIDER?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
};

// Chooses the sender from EMAIL_PROVIDER (strategy pattern, like OCR_PROVIDER).
// A missing setting stops the app at startup, not when the first person registers.
export function createEmailService(env: EmailEnv): EmailService {
  const provider = (env.EMAIL_PROVIDER ?? 'fake').trim().toLowerCase();
  if (provider === 'fake') return new FakeEmailService();

  if (provider === 'smtp') {
    // APP_URL is where the verify link points, e.g. https://splitlah.duckdns.org
    for (const name of ['SMTP_USER', 'SMTP_PASS', 'APP_URL'] as const) {
      if (!env[name]) {
        throw new Error(`${name} is required when EMAIL_PROVIDER=smtp`);
      }
    }
    const port = Number(env.SMTP_PORT ?? 465);
    const transport = createTransport({
      host: env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465, // 465 is TLS from the start; 587 upgrades with STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    return new SmtpEmailService(
      (message) => transport.sendMail(message),
      env.EMAIL_FROM ?? `SplitLah <${env.SMTP_USER}>`,
    );
  }

  throw new Error(
    `EMAIL_PROVIDER must be fake or smtp (got "${env.EMAIL_PROVIDER}")`,
  );
}
