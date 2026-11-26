import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { pwaOptions } from './pwa.config.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  // In development, /api goes to the local API, so the browser sees one site,
  // just like Caddy in production
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: {
    environment: 'jsdom', // a fake browser (DOM, localStorage) for component tests
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '*.test.ts'], // not e2e/: Playwright runs those
    coverage: {
      provider: 'v8',
      // text: the table in the CI log. lcov: coverage/lcov.info (read by
      // qa/report.ts) and the HTML report in coverage/lcov-report (KAN-102)
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/test-setup.ts',
        'src/test-utils.tsx',
      ],
      // Coverage gate: `npm test` (run in CI) fails below these numbers
      thresholds: { lines: 90, branches: 90 },
    },
  },
});
