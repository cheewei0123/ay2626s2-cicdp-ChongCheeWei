// One text message to one Singapore mobile (+65…), KAN-91
export interface Sms {
  to: string;
  text: string;
}

// The contract every SMS sender follows: Fake for tests, CI and local runs; AWS SNS
// on the live site. The same strategy pattern as EMAIL_SERVICE and OCR_SERVICE.
export interface SmsService {
  readonly provider: string;
  send(sms: Sms): Promise<void>;
}

export const SMS_SERVICE = Symbol('SMS_SERVICE');
