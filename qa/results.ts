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

// ---- Single tests (KAN-103): for tests per feature, failed tests and requirements ----

export type TestCase = {
  key: string; // api/src/auth/auth.service.spec.ts, web/..., browser/<test title>
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string; // the start of the error, for a failed test
  tags: string[]; // browser tests only, e.g. @bills
};

// Error text from the runners has colours and long stacks; the page needs the start
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
export const shortError = (text = '') =>
  text
    .replace(ANSI, '')
    .trim()
    .split('\n')
    .slice(0, 4)
    .join('\n')
    .slice(0, 400);

// /home/runner/work/x/x/apps/api/src/a.spec.ts -> src/a.spec.ts
export function underApp(path: string, app: string): string {
  const p = path.replaceAll('\\', '/');
  const at = p.lastIndexOf(`apps/${app}/`);
  return at < 0 ? p : p.slice(at + `apps/${app}/`.length);
}

type VitestFile = {
  name: string;
  status: string;
  message?: string;
  assertionResults: {
    fullName: string;
    status: string;
    failureMessages?: string[];
  }[];
};

export function vitestTests(
  json: { testResults: VitestFile[] },
  app: string,
): TestCase[] {
  return json.testResults.flatMap((file) => {
    const key = `${app}/${underApp(file.name, app)}`;
    const tests: TestCase[] = file.assertionResults.map((t) => ({
      key,
      name: t.fullName,
      status:
        t.status === 'passed'
          ? 'passed'
          : t.status === 'failed'
            ? 'failed'
            : 'skipped',
      message:
        t.status === 'failed' ? shortError(t.failureMessages?.[0]) : undefined,
      tags: [],
    }));
    // A file that fails to load (a syntax or import error) has no tests in it
    if (file.status === 'failed' && !tests.some((t) => t.status === 'failed'))
      tests.push({
        key,
        name: `${underApp(file.name, app)} did not run`,
        status: 'failed',
        message: shortError(file.message),
        tags: [],
      });
    return tests;
  });
}

type PlaywrightSuite = {
  specs?: {
    title: string;
    tags?: string[];
    tests: {
      projectName: string;
      status: string;
      results: { error?: { message?: string } }[];
    }[];
  }[];
  suites?: PlaywrightSuite[];
};

// One case per test per browser (project); `expected` is a pass
export function playwrightTests(json: {
  suites: PlaywrightSuite[];
}): TestCase[] {
  const walk = (s: PlaywrightSuite): TestCase[] => [
    ...(s.specs ?? []).flatMap((spec) =>
      spec.tests.map((t): TestCase => {
        const status =
          t.status === 'expected'
            ? 'passed'
            : t.status === 'skipped'
              ? 'skipped'
              : 'failed';
        return {
          key: `browser/${spec.title}`,
          name: `${spec.title} (${t.projectName})`,
          status,
          message:
            status === 'failed'
              ? shortError(t.results.at(-1)?.error?.message)
              : undefined,
          tags: (spec.tags ?? []).map((tag) =>
            tag.startsWith('@') ? tag : `@${tag}`,
          ),
        };
      }),
    ),
    ...(s.suites ?? []).flatMap(walk),
  ];
  return json.suites.flatMap(walk);
}

export type Tally = { passed: number; failed: number; skipped: number };
export const tally = (tests: TestCase[]): Tally => ({
  passed: tests.filter((t) => t.status === 'passed').length,
  failed: tests.filter((t) => t.status === 'failed').length,
  skipped: tests.filter((t) => t.status === 'skipped').length,
});
