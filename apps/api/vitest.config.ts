import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts', 'src/main.ts'],
      // Coverage gate: `npm run test:cov` (run in CI) fails below these numbers
      thresholds: {
        'src/split/**': { lines: 90, branches: 90 },
        'src/common/**': { lines: 90, branches: 90 },
      },
    },
  },
});
