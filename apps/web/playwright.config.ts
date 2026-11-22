import { defineConfig, devices } from '@playwright/test';

// Browser tests (KAN-53): a real WebKit browser, sized like an iPhone, against the whole
// app running in Docker (infra/docker-compose.ci.yml). Start that first, then:
//   npx playwright test
export default defineConfig({
  testDir: './e2e',
  // The two tests are one story (the owner shares, then a friend joins), so in order
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI, // a stray test.only must not pass CI quietly
  retries: 0, // a flaky test should fail and be fixed, not retried until green
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    // Kept only when a test fails: the trace (every step, network call and DOM
    // snapshot) and a video, uploaded by CI as an artifact
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // iPhone 14: WebKit (Safari's engine), 390×664, touch, mobile user agent
    { name: 'iPhone 14', use: { ...devices['iPhone 14'] } },
  ],
});
