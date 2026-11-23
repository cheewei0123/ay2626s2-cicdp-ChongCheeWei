// Singapore mobile numbers: +65 then 8 digits starting with 8 or 9 (IMDA numbering plan). KAN-89.

// Keeps only the local 8 digits: "+65 9123 4567", "6591234567" and "9123-4567" all give "91234567"
export function localDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return (
    digits.length > 8 && digits.startsWith('65') ? digits.slice(2) : digits
  ).slice(0, 8);
}

// The form keeps 8 digits; the API stores "+65" + digits
export const toE164 = (digits: string) => (digits ? `+65${digits}` : '');
