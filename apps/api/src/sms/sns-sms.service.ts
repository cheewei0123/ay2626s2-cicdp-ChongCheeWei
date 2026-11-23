import type { Sms, SmsService } from './sms.interface.js';

// What it needs from the AWS SDK's SNSClient: just "publish this", so tests can pass a fake
export type Publish = (input: {
  PhoneNumber: string;
  Message: string;
  MessageAttributes: Record<
    string,
    { DataType: 'String'; StringValue: string }
  >;
}) => Promise<unknown>;

// Sends through Amazon SNS. No access key is stored anywhere: on the server the SDK
// picks up the EC2 instance's IAM role, which may only call sns:Publish.
export class SnsSmsService implements SmsService {
  readonly provider = 'sns';

  constructor(private readonly publish: Publish) {}

  async send(sms: Sms): Promise<void> {
    await this.publish({
      PhoneNumber: sms.to,
      Message: sms.text,
      MessageAttributes: {
        // Transactional: a one-time code, delivered first and never as marketing
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    });
  }
}
