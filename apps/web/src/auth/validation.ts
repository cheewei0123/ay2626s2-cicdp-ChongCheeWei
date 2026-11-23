// The same rules as the API's RegisterDto and LoginDto, checked before sending,
// so most mistakes are shown at once without a round trip

export type FieldErrors = Partial<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The 8 local digits typed after the fixed +65 (KAN-89)
export const SG_MOBILE = /^[89]\d{7}$/;
export const MOBILE_ERROR = '8 digits, starting with 8 or 9';

// Just the email check, for Forgot password (KAN-90): '' when it looks fine
export function validateEmail(email: string): string {
  return EMAIL.test(email.trim()) ? '' : 'Enter a valid email address';
}

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
  const mobile = input.paynowMobile;
  if (mobile && !SG_MOBILE.test(mobile)) errors.paynowMobile = MOBILE_ERROR;
  return errors;
}

// The same rule as the API's UpdateMeDto
export function validateProfile(input: { displayName: string }): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.displayName.trim();
  if (name.length < 1 || name.length > 50)
    errors.displayName = 'Enter a name (up to 50 characters)';
  return errors;
}

// Choosing a new password (reset or change, KAN-90): same length rules as Register,
// typed twice so a typo doesn't lock you out
export function validateNewPassword(input: {
  password: string;
  confirm: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (input.password.length < 8) errors.password = 'At least 8 characters';
  else if (input.password.length > 128)
    errors.password = 'At most 128 characters';
  else if (input.confirm !== input.password)
    errors.confirm = 'The two passwords are different';
  return errors;
}
