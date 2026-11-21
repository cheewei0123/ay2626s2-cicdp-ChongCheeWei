import type { Email, EmailService } from './email.interface.js';

// The one nodemailer call we use, so a test can pass a stand-in instead of a real server
export type SendMail = (message: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) => Promise<unknown>;

// Sends through an SMTP server: Gmail with an app password on the live site (free, ~500 a day)
export class SmtpEmailService implements EmailService {
  readonly provider = 'smtp';

  constructor(
    private readonly sendMail: SendMail,
    private readonly from: string,
  ) {}

  async send(email: Email): Promise<void> {
    await this.sendMail({ from: this.from, ...email });
  }
}
