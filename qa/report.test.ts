// Tests for the QA page's parsing (KAN-102). Run: npm run qa:test
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  byFolder,
  folderOf,
  meetsGate,
  parseLcov,
  pct,
  readGates,
  total,
} from './lcov.ts';
import { byFeature, featureOf, OTHER } from './features.ts';
import { siteLink } from './links.ts';
import { fromPlaywright, fromVitest } from './results.ts';

// Two files as Vitest writes them on Windows, with the lines lcov has that we skip
const LCOV = [
  'TN:',
  'SF:src\\split\\money.ts',
  'FN:6,toCents',
  'FNF:2',
  'FNH:2',
  'DA:4,1',
  'LF:10',
  'LH:9',
  'BRF:4',
  'BRH:4',
  'end_of_record',
  'TN:',
  'SF:src/split/engine.ts',
  'FNF:3',
  'FNH:1',
  'LF:30',
  'LH:27',
  'BRF:6',
  'BRH:3',
  'end_of_record',
  'SF:src/main.ts',
  'LF:5',
  'LH:0',
  'end_of_record',
].join('\r\n');

describe('parseLcov', () => {
  it('reads each record and uses / in paths', () => {
    const files = parseLcov(LCOV);
    assert.deepEqual(
      files.map((f) => f.file),
      ['src/split/money.ts', 'src/split/engine.ts', 'src/main.ts'],
    );
    assert.deepEqual(files[0], {
      file: 'src/split/money.ts',
      lines: { found: 10, hit: 9 },
      branches: { found: 4, hit: 4 },
      functions: { found: 2, hit: 2 },
    });
  });

  it('gives zeros for counts a record leaves out', () => {
    assert.deepEqual(parseLcov(LCOV)[2].branches, { found: 0, hit: 0 });
  });

  it('drops a record that never ends, and reads an empty file as none', () => {
    assert.equal(parseLcov('SF:src/a.ts\nLF:3\nLH:3').length, 0);
    assert.equal(parseLcov('').length, 0);
  });
});

describe('totals and folders', () => {
  it('takes the percentage from the sums, not an average of files', () => {
    const split = total(parseLcov(LCOV).slice(0, 2));
    assert.deepEqual(split.lines, { found: 40, hit: 36 });
    assert.equal(pct(split.lines), 90); // the average of 90% and 90% happens to match
    assert.equal(pct(split.branches), 70); // 7 of 10; the average would be 75
  });

  it('counts nothing to cover as 100%', () => {
    assert.equal(pct({ found: 0, hit: 0 }), 100);
  });

  it('groups files by their folder under src', () => {
    assert.equal(folderOf('src/split/money.ts'), 'src/split');
    assert.equal(folderOf('src/bills/ui/row.tsx'), 'src/bills');
    assert.equal(folderOf('src/main.ts'), 'src');
    assert.equal(folderOf('vite.config.ts'), '.');
    const folders = byFolder(parseLcov(LCOV));
    assert.deepEqual([...folders.keys()], ['src', 'src/split']);
    assert.deepEqual(folders.get('src/split')?.functions, { found: 5, hit: 3 });
  });
});

describe('readGates', () => {
  it('reads per-folder gates from the API config', () => {
    const gates = readGates(`thresholds: {
        'src/split/**': { lines: 90, branches: 90 },
        'src/auth/**': { lines: 85, branches: 80 },
      },`);
    assert.deepEqual(gates.get('src/split'), { lines: 90, branches: 90 });
    assert.deepEqual(gates.get('src/auth'), { lines: 85, branches: 80 });
    assert.equal(gates.has(''), false);
  });

  it('reads one gate for the whole app from the web config', () => {
    const gates = readGates('thresholds: { lines: 90, branches: 90 },');
    assert.deepEqual([...gates], [['', { lines: 90, branches: 90 }]]);
  });

  it('passes only when lines and branches both reach the gate', () => {
    const split = total(parseLcov(LCOV).slice(0, 2)); // 90% lines, 70% branches
    assert.equal(meetsGate(split, { lines: 90, branches: 70 }), true);
    assert.equal(meetsGate(split, { lines: 90, branches: 90 }), false);
  });
});

describe('test results', () => {
  it('reads Vitest json', () => {
    const suite = fromVitest({
      numTotalTests: 10,
      numPassedTests: 8,
      numFailedTests: 1,
      numPendingTests: 1,
      numTodoTests: 0,
      success: false,
      testResults: [{}, {}],
    });
    assert.deepEqual(suite, {
      files: 2,
      total: 10,
      passed: 8,
      failed: 1,
      skipped: 1,
      ok: false,
    });
  });

  it('reads Playwright json and counts a flaky test as a failure', () => {
    const json = {
      suites: [{}],
      stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 },
    };
    assert.equal(fromPlaywright(json).ok, true);
    const flaky = fromPlaywright({
      ...json,
      stats: { ...json.stats, flaky: 1 },
    });
    assert.deepEqual(flaky, {
      files: 1,
      total: 4,
      passed: 3,
      failed: 1,
      skipped: 0,
      ok: false,
    });
  });
});

describe('siteLink', () => {
  const blob = 'https://github.com/me/repo/blob/abc123';
  it('keeps full URLs and headings', () => {
    assert.equal(
      siteLink('https://splitlah.duckdns.org', blob),
      'https://splitlah.duckdns.org',
    );
    assert.equal(siteLink('#known-gaps', blob), '#known-gaps');
  });

  it('keeps pages and results that are on the site', () => {
    assert.equal(siteLink('ocr-accuracy.md', blob), 'receipts.html');
    assert.equal(
      siteLink('results/k6-2026-11-22.txt', blob),
      'results/k6-2026-11-22.txt',
    );
  });

  it('opens anything else on GitHub at the commit, keeping the heading', () => {
    assert.equal(
      siteLink('../docs/pipeline.md#browser-tests', blob),
      'https://github.com/me/repo/blob/abc123/docs/pipeline.md#browser-tests',
    );
  });
});

describe('features', () => {
  const file = (name: string, hit: number) => ({
    file: name,
    lines: { found: 10, hit },
    branches: { found: 0, hit: 0 },
    functions: { found: 0, hit: 0 },
  });

  it('puts a file in the feature with the longest matching path', () => {
    assert.equal(featureOf('web', 'src/bills/guest.ts'), 'Bills');
    assert.equal(featureOf('web', 'src/bills/split.ts'), 'Split maths');
    assert.equal(
      featureOf('web', 'src/pages/ScanReceipt.tsx'),
      'Receipt scanning',
    );
    assert.equal(featureOf('api', 'src/app.controller.ts'), 'App shell');
    assert.equal(
      featureOf('api', 'src/telegram/telegram.service.ts'),
      'Accounts',
    );
  });

  it('shows a file no feature lists as Other', () => {
    assert.equal(featureOf('web', 'src/pages/NewPage.tsx'), OTHER);
    assert.equal(featureOf('api', 'src/main.ts'), OTHER);
  });

  it('adds up the files of each feature', () => {
    const groups = byFeature('api', [
      file('src/bills/bills.service.ts', 10),
      file('src/bills/share.service.ts', 5),
      file('src/split/money.ts', 10),
    ]);
    assert.deepEqual(groups.get('Bills')?.lines, { found: 20, hit: 15 });
    assert.deepEqual(groups.get('Split maths')?.lines, { found: 10, hit: 10 });
  });
});
