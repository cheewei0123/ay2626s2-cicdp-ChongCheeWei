import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In development, /api goes to the local API, so the browser sees one site,
  // just like Caddy in production
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: {
    environment: 'jsdom', // a fake browser (DOM, localStorage) for component tests
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
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
