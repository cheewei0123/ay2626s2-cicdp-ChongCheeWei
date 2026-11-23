import { Logger } from '@nestjs/common';
import { FakeSmsService } from './fake-sms.service.js';
import { createSmsService } from './sms.factory.js';
import { SnsSmsService } from './sns-sms.service.js';

describe('SMS senders (KAN-91)', () => {
  it('uses the fake sender by default, which keeps and logs each message', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const sms = createSmsService({}) as FakeSmsService;

    await sms.send({ to: '+6591234567', text: 'Your code is 123456' });

    expect(sms.provider).toBe('fake');
    expect(sms.sent).toEqual([
      { to: '+6591234567', text: 'Your code is 123456' },
    ]);
    expect(log).toHaveBeenCalledWith(
      '(fake) to +6591234567: Your code is 123456',
    );
  });

  it('builds the SNS sender only with a region, and refuses anything else', () => {
    expect(
      createSmsService({ SMS_PROVIDER: ' SNS ', AWS_REGION: 'ap-southeast-1' })
        .provider,
    ).toBe('sns');
    expect(() => createSmsService({ SMS_PROVIDER: 'sns' })).toThrow(
      'AWS_REGION is required when SMS_PROVIDER=sns',
    );
    expect(() => createSmsService({ SMS_PROVIDER: 'twilio' })).toThrow(
      'SMS_PROVIDER must be fake or sns (got "twilio")',
    );
  });

  it('SNS publishes the code as a transactional SMS', async () => {
    const publish = vi.fn().mockResolvedValue({ MessageId: 'm1' });

    await new SnsSmsService(publish).send({ to: '+6591234567', text: 'hi' });

    expect(publish).toHaveBeenCalledWith({
      PhoneNumber: '+6591234567',
      Message: 'hi',
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    });
  });

  it('SNS passes a failure on, so the caller can say the code was not sent', async () => {
    const publish = vi
      .fn()
      .mockRejectedValue(new Error('not in the sandbox list'));
    await expect(
      new SnsSmsService(publish).send({ to: '+6591234567', text: 'hi' }),
    ).rejects.toThrow('not in the sandbox list');
  });
});
