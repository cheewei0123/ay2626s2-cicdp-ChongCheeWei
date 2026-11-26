// Tests for the QA page's test, requirement and scan readers (KAN-103). Run: npm run qa:test
import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { featuresOfTags, testFeature } from './features.ts';
import { checkRequirement, REQUIREMENTS } from './requirements.ts';
import {
  playwrightTests,
  shortError,
  tally,
  underApp,
  vitestTests,
} from './results.ts';
import {
  jobResults,
  lighthouseScores,
  mutationScore,
  zapAlerts,
} from './scans.ts';

const root = join(import.meta.dirname, '..');

describe('tests by feature', () => {
  it('puts a unit test where the file it tests is', () => {
    assert.equal(
      testFeature('web', 'src/components/PhoneField.test.tsx'),
      'Accounts',
    );
    assert.equal(testFeature('web', 'src/bills/paynow.test.tsx'), 'PayNow');
    assert.equal(testFeature('web', 'src/bills/split.test.ts'), 'Split maths');
    assert.equal(testFeature('web', 'pwa.config.test.ts'), 'App shell');
    assert.equal(
      testFeature('api', 'src/split/split.edge-cases.spec.ts'),
      'Split maths',
    );
  });

  it('puts an API end-to-end file in its listed feature', () => {
    assert.equal(testFeature('api', 'test/claims.e2e-spec.ts'), 'Bills');
    assert.equal(testFeature('api', 'test/mfa.e2e-spec.ts'), 'Accounts');
    assert.equal(testFeature('api', 'test/new-thing.e2e-spec.ts'), 'Other');
  });

  it('reads the features of a browser test from its tags', () => {
    assert.deepEqual(featuresOfTags(['@bills', '@a11y', '@split']), [
      'Bills',
      'Split maths',
    ]);
  });

  it('every API e2e file and unit test file today has a feature', () => {
    const e2e = readdirSync(join(root, 'apps/api/test')).filter((f) =>
      f.endsWith('.e2e-spec.ts'),
    );
    for (const f of e2e)
      assert.notEqual(testFeature('api', `test/${f}`), 'Other', f);
  });
});

describe('single test results', () => {
  it('makes a runner path relative to its app', () => {
    assert.equal(
      underApp('/home/runner/work/r/r/apps/api/src/a.spec.ts', 'api'),
      'src/a.spec.ts',
    );
    assert.equal(
      underApp('C:/x/apps/web/src/b.test.tsx', 'web'),
      'src/b.test.tsx',
    );
  });

  it('keeps the start of an error without terminal colours', () => {
    const red = `${String.fromCharCode(27)}[31m`;
    assert.equal(
      shortError(`${red}expected 1 to be 2\nline 2\nline 3\nline 4\nline 5`),
      'expected 1 to be 2\nline 2\nline 3\nline 4',
    );
  });

  it('reads each Vitest test, and a file that did not run as a failure', () => {
    const cases = vitestTests(
      {
        testResults: [
          {
            name: '/w/apps/api/src/split/money.spec.ts',
            status: 'failed',
            assertionResults: [
              { fullName: 'money rounds', status: 'passed' },
              {
                fullName: 'money adds',
                status: 'failed',
                failureMessages: ['AssertionError: no'],
              },
              { fullName: 'money later', status: 'todo' },
            ],
          },
          {
            name: '/w/apps/api/test/bad.e2e-spec.ts',
            status: 'failed',
            message: 'SyntaxError',
            assertionResults: [],
          },
        ],
      },
      'api',
    );
    assert.deepEqual(
      cases.map((c) => [c.key, c.status]),
      [
        ['api/src/split/money.spec.ts', 'passed'],
        ['api/src/split/money.spec.ts', 'failed'],
        ['api/src/split/money.spec.ts', 'skipped'],
        ['api/test/bad.e2e-spec.ts', 'failed'],
      ],
    );
    assert.equal(cases[1].message, 'AssertionError: no');
    assert.equal(cases[3].message, 'SyntaxError');
    assert.deepEqual(tally(cases), { passed: 1, failed: 2, skipped: 1 });
  });

  it('reads each Playwright test per browser, with its tags', () => {
    const cases = playwrightTests({
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  title: 'guest: join',
                  tags: ['@bills', 'split'],
                  tests: [
                    {
                      projectName: 'iPhone 14',
                      status: 'expected',
                      results: [{}],
                    },
                    {
                      projectName: 'Pixel 7',
                      status: 'unexpected',
                      results: [{ error: { message: 'timeout' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    assert.deepEqual(cases, [
      {
        key: 'browser/guest: join',
        name: 'guest: join (iPhone 14)',
        status: 'passed',
        message: undefined,
        tags: ['@bills', '@split'],
      },
      {
        key: 'browser/guest: join',
        name: 'guest: join (Pixel 7)',
        status: 'failed',
        message: 'timeout',
        tags: ['@bills', '@split'],
      },
    ]);
  });
});

describe('requirements', () => {
  const ok = (key: string) => ({
    key,
    name: key,
    status: 'passed' as const,
    tags: [],
  });

  it('matches tests by the start of their key and lists the ones not run', () => {
    const r = {
      id: 'FR0',
      title: 't',
      text: 't',
      tests: ['api/test/claims', 'browser/guest'],
    };
    const c = checkRequirement(r, [
      ok('api/test/claims.e2e-spec.ts'),
      ok('api/test/claims.e2e-spec.ts'),
    ]);
    assert.deepEqual(c, {
      passed: 2,
      failed: 0,
      skipped: 0,
      missing: ['browser/guest'],
    });
  });

  it('covers FR1 to FR11 from the report', () => {
    assert.deepEqual(
      REQUIREMENTS.map((r) => r.id),
      Array.from({ length: 11 }, (_, i) => `FR${i + 1}`),
    );
  });

  it('names only tests that exist', () => {
    const browser = readFileSync(
      join(root, 'apps/web/e2e/split-a-bill.spec.ts'),
      'utf8',
    );
    for (const ref of REQUIREMENTS.flatMap((r) => r.tests)) {
      const [kind, ...rest] = ref.split('/');
      const path = rest.join('/');
      if (kind === 'browser') {
        assert.ok(browser.includes(`'${path}`), ref);
        continue;
      }
      const dir = join(
        root,
        'apps',
        kind,
        path.slice(0, path.lastIndexOf('/')),
      );
      const start = path.slice(path.lastIndexOf('/') + 1);
      assert.ok(
        existsSync(dir) &&
          readdirSync(dir).some(
            (f) =>
              f.startsWith(start) && /\.(spec|test|e2e-spec)\.tsx?$/.test(f),
          ),
        ref,
      );
    }
  });
});

describe('scan reports', () => {
  it('turns Lighthouse scores into whole numbers', () => {
    const scores = lighthouseScores({
      categories: {
        performance: { title: 'Performance', score: 0.874 },
        seo: { title: 'SEO', score: null },
      },
    });
    assert.deepEqual(scores, [
      { title: 'Performance', score: 87 },
      { title: 'SEO', score: null },
    ]);
  });

  it('sorts ZAP alerts by risk and counts each risk', () => {
    const z = zapAlerts({
      site: [
        {
          alerts: [
            { name: 'Low thing', riskcode: '1', count: '3' },
            { name: 'Medium thing', riskcode: '2', instances: [{}, {}] },
          ],
        },
      ],
    });
    assert.deepEqual(z.alerts, [
      { name: 'Medium thing', risk: 2, count: 2 },
      { name: 'Low thing', risk: 1, count: 3 },
    ]);
    assert.deepEqual(z.byRisk, [0, 1, 1, 0]);
  });

  it('scores mutants like Stryker: caught out of the ones that could be caught', () => {
    const m = mutationScore({
      files: {
        'a.ts': {
          mutants: [
            { status: 'Killed' },
            { status: 'Killed' },
            { status: 'Timeout' },
            { status: 'Survived' },
          ],
        },
        'b.ts': {
          mutants: [
            { status: 'NoCoverage' },
            { status: 'CompileError' },
            { status: 'Ignored' },
          ],
        },
      },
    });
    assert.deepEqual(m, {
      killed: 2,
      timeout: 1,
      survived: 1,
      noCoverage: 1,
      score: 60,
    });
  });

  it('lists each CI job with its result', () => {
    assert.deepEqual(
      jobResults({ lint: { result: 'success' }, trivy: { result: 'failure' } }),
      [
        { job: 'lint', result: 'success' },
        { job: 'trivy', result: 'failure' },
      ],
    );
  });
});
