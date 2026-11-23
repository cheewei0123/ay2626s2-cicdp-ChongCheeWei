import { Matches } from 'class-validator';

// POST /api/me/phone: the number to check (KAN-91)
export class PhoneDto {
  @Matches(/^\+65[89]\d{7}$/, {
    message: 'phone must be a Singapore mobile number like +6591234567',
  })
  phone!: string;
}

// POST /api/me/phone/verify: the code from the SMS
export class PhoneCodeDto {
  @Matches(/^\d{6}$/, { message: 'code must be the 6 digits from the SMS' })
  code!: string;
}
