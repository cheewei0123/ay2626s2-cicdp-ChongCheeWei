// Turns the JSON the test runners write into one shape for the QA page (KAN-102).

export type Suite = {
  files: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  ok: boolean;
};

// Vitest's json reporter (`--reporter=json`), the same shape as Jest's
type VitestJson = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  success: boolean;
  testResults: unknown[];
};

export function fromVitest(json: VitestJson): Suite {
  return {
    files: json.testResults.length,
    total: json.numTotalTests,
    passed: json.numPassedTests,
    failed: json.numFailedTests,
    skipped: json.numPendingTests + json.numTodoTests,
    ok: json.success && json.numFailedTests === 0,
  };
}

// Playwright's json reporter: `expected` passed, `unexpected` failed, and a
// `flaky` test failed first and passed on a retry (CI allows no retries)
type PlaywrightJson = {
  suites: unknown[];
  stats: {
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
};

export function fromPlaywright(json: PlaywrightJson): Suite {
  const { expected, unexpected, flaky, skipped } = json.stats;
  return {
    files: json.suites.length,
    total: expected + unexpected + flaky + skipped,
    passed: expected,
    failed: unexpected + flaky,
    skipped,
    ok: unexpected + flaky === 0,
  };
}
