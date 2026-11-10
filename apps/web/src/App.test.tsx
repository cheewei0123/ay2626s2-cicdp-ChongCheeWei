import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import App from './App';

it('opens on the log in page when nobody is logged in', async () => {
  render(<App />);
  expect(
    await screen.findByRole('button', { name: 'Log in' }),
  ).toBeInTheDocument();
  expect(window.location.pathname).toBe('/login');
});
