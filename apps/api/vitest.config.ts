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
      // Modules only wire classes together; the e2e tests prove the wiring works
      exclude: [
        'src/generated/**',
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/**/*.module.ts',
      ],
      // Coverage gate: `npm run test:cov` (run in CI) fails below these numbers
      thresholds: {
        'src/split/**': { lines: 90, branches: 90 },
        'src/common/**': { lines: 90, branches: 90 },
        'src/auth/**': { lines: 90, branches: 90 },
        'src/bills/**': { lines: 90, branches: 90 },
      },
    },
  },
});
