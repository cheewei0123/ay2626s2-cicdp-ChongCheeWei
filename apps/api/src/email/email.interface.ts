// One plain-text email. Plain text is enough for a link, and nothing can break in it.
export interface Email {
  to: string;
  subject: string;
  text: string;
}

// The contract every email sender follows (Fake for tests, SMTP for the live site),
// the same strategy pattern as OCR_SERVICE
export interface EmailService {
  readonly provider: string;
  send(email: Email): Promise<void>;
}

// The token Nest uses to find "whichever sender EMAIL_PROVIDER chose"
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
