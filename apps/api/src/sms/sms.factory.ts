import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { FakeSmsService } from './fake-sms.service.js';
import type { SmsService } from './sms.interface.js';
import { SnsSmsService } from './sns-sms.service.js';

type SmsEnv = { SMS_PROVIDER?: string; AWS_REGION?: string };

// Chooses the sender from SMS_PROVIDER, like createEmailService.
// A missing setting stops the app at startup, not at the first code sent.
export function createSmsService(env: SmsEnv): SmsService {
  const provider = (env.SMS_PROVIDER ?? 'fake').trim().toLowerCase();
  if (provider === 'fake') return new FakeSmsService();

  if (provider === 'sns') {
    if (!env.AWS_REGION) {
      throw new Error('AWS_REGION is required when SMS_PROVIDER=sns');
    }
    const client = new SNSClient({ region: env.AWS_REGION });
    return new SnsSmsService((input) => client.send(new PublishCommand(input)));
  }

  throw new Error(
    `SMS_PROVIDER must be fake or sns (got "${env.SMS_PROVIDER}")`,
  );
}
