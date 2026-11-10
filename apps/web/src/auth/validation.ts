// The same rules as the API's RegisterDto and LoginDto, checked before sending,
// so most mistakes are shown at once without a round trip

export type FieldErrors = Partial<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SG_MOBILE = /^\+65[89]\d{7}$/;

export function validateLogin(input: {
  email: string;
  password: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL.test(input.email.trim()))
    errors.email = 'Enter a valid email address';
  if (!input.password) errors.password = 'Enter your password';
  return errors;
}

export function validateRegister(input: {
  displayName: string;
  email: string;
  password: string;
  paynowMobile: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.displayName.trim();
  if (name.length < 1 || name.length > 50)
    errors.displayName = 'Enter a name (up to 50 characters)';
  if (!EMAIL.test(input.email.trim()))
    errors.email = 'Enter a valid email address';
  if (input.password.length < 8) errors.password = 'At least 8 characters';
  else if (input.password.length > 128)
    errors.password = 'At most 128 characters';
  const mobile = input.paynowMobile.trim();
  if (mobile && !SG_MOBILE.test(mobile))
    errors.paynowMobile = 'A Singapore mobile like +6591234567';
  return errors;
}
