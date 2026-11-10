// Runs before every test file
import '@testing-library/jest-dom/vitest'; // adds expect(...).toBeInTheDocument() and friends
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup(); // remove what the test rendered
  localStorage.clear(); // no login token leaks into the next test
  vi.unstubAllGlobals(); // undo the fake fetch
});
