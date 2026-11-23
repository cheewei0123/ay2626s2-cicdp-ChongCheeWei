import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { localDigits, toE164 } from '../auth/phone';
import { PhoneField } from './PhoneField';

describe('localDigits (KAN-89)', () => {
  it.each([
    ['91234567', '91234567'],
    ['9123 4567', '91234567'],
    ['+65 9123 4567', '91234567'], // pasted with the country code
    ['6591234567', '91234567'],
    ['912345678', '91234567'], // never more than 8 digits
    ['abc', ''],
  ])('%s → %s', (raw, digits) => {
    expect(localDigits(raw)).toBe(digits);
  });

  it('adds +65 back for the API, and leaves an empty number empty', () => {
    expect(toE164('91234567')).toBe('+6591234567');
    expect(toE164('')).toBe('');
  });
});

describe('PhoneField', () => {
  function Harness() {
    const [value, setValue] = useState('');
    return (
      <PhoneField label="Mobile" name="m" value={value} onChange={setValue} />
    );
  }

  it('shows a fixed +65 and keeps only up to 8 digits as you type', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('+65')).toBeInTheDocument();
    const input = screen.getByLabelText('Mobile');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await user.type(input, '9a1-23 4567 89');
    expect(input).toHaveValue('91234567');
  });
});
