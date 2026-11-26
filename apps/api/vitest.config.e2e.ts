import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Loads apps/api/.env (DATABASE_URL, JWT_SECRET) like main.ts does
    setupFiles: ['dotenv/config'],
    // Coverage only with --coverage (CI): what the real routes and database reach.
    // No gate; the QA report shows it next to the unit coverage (KAN-103)
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage-e2e',
    },
  },
});
