// Builds the QA report site that CI publishes to GitHub Pages (KAN-102, KAN-103).
// It reads what the CI jobs wrote and puts it in qa/site:
//   index.html      test results, failed tests, coverage and tests per feature, the
//                   gates, requirements and their tests, the other checks, then qa-report.md
//   receipts.html   ocr-accuracy.md
//   coverage/api, coverage/api-e2e, coverage/web   the HTML coverage reports (lcov-report)
//   browser-tests   Playwright's HTML report
//   mutation.html, lighthouse.html, zap.html   the Stryker, Lighthouse and ZAP reports
//   results         the saved k6 and coverage text files
// Run after the tests (see qa/README.md): npm run qa:report
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import {
  byFolder,
  meetsGate,
  parseLcov,
  pct,
  readGates,
  total,
} from './lcov.ts';
import type { Coverage, FileCoverage, Gate } from './lcov.ts';
import {
  byFeature,
  FEATURES,
  featureOf,
  featuresOfTags,
  OTHER,
  testFeature,
} from './features.ts';
import type { App } from './features.ts';
import { siteLink } from './links.ts';
import { checkRequirement, REQUIREMENTS } from './requirements.ts';
import {
  fromPlaywright,
  fromVitest,
  playwrightTests,
  tally,
  vitestTests,
} from './results.ts';
import type { Suite, TestCase } from './results.ts';
import {
  jobResults,
  lighthouseScores,
  mutationScore,
  RISKS,
  zapAlerts,
} from './scans.ts';

const root = join(import.meta.dirname, '..');
const out = join(root, 'qa/site');
const at = (path: string) => join(root, path);
const read = (path: string) =>
  existsSync(at(path)) ? readFileSync(at(path), 'utf8') : undefined;
const readJson = (path: string) => {
  const text = read(path);
  return text === undefined ? undefined : JSON.parse(text);
};

// GitHub Actions sets these; a local run links to main instead
const env = process.env;
const repo = `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY ?? 'cheewei0123/ay2626s2-cicdp-ChongCheeWei'}`;
const ref = env.GITHUB_SHA ?? 'main';

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
// Cut to 2 decimals, not rounded, like Vitest's table (95.949 shows as 95.94)
const fmt = (n: number) => `${Math.floor(n * 100) / 100}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const badge = (ok: boolean | undefined, yes = 'Pass', no = 'Fail') =>
  ok === undefined
    ? '<span class="badge none">Not run</span>'
    : `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? yes : no}</span>`;

// ---- Test results ----

const json = {
  apiUnit: readJson('apps/api/test-results.json'),
  web: readJson('apps/web/test-results.json'),
  apiE2e: readJson('apps/api/e2e-results.json'),
  browser: readJson('apps/web/playwright-results.json'),
};
// Every single test of the run, keyed by its file (or browser test title)
const tests = {
  unitApi: json.apiUnit ? vitestTests(json.apiUnit, 'api') : [],
  unitWeb: json.web ? vitestTests(json.web, 'web') : [],
  e2e: json.apiE2e ? vitestTests(json.apiE2e, 'api') : [],
  browser: json.browser ? playwrightTests(json.browser) : [],
};
const allTests: TestCase[] = Object.values(tests).flat();

type Row = { name: string; what: string; suite?: Suite; report?: string };
const suites: Row[] = [
  {
    name: 'API unit',
    what: 'Vitest',
    suite: json.apiUnit && fromVitest(json.apiUnit),
  },
  {
    name: 'Web unit and component',
    what: 'Vitest + Testing Library',
    suite: json.web && fromVitest(json.web),
  },
  {
    name: 'API end-to-end',
    what: 'Vitest + Supertest, Postgres 18',
    suite: json.apiE2e && fromVitest(json.apiE2e),
  },
  {
    name: 'Browser',
    what: 'Playwright on the Docker images: iPhone 14 (WebKit) and Pixel 7 (Chromium), with axe',
    suite: json.browser && fromPlaywright(json.browser),
    report: existsSync(at('apps/web/playwright-report'))
      ? 'browser-tests/index.html'
      : undefined,
  },
];

function suiteCard({ name, what, suite, report }: Row) {
  const body = suite
    ? `<p class="big">${suite.passed}<span> / ${suite.total} passed</span></p>
       <p class="muted">${plural(suite.files, 'file')}${suite.failed ? ` · ${suite.failed} failed` : ''}${suite.skipped ? ` · ${suite.skipped} skipped` : ''}</p>`
    : '<p class="big">–</p><p class="muted">No results: the job did not finish</p>';
  const link = report ? `<p><a href="${report}">Open the report</a></p>` : '';
  return `<div class="card"><div class="row"><h3>${name}</h3>${badge(suite?.ok)}</div>
    <p class="muted">${what}</p>${body}${link}</div>`;
}

// Each failed test by name, with the start of its error
function failedTests() {
  const failed = allTests.filter((t) => t.status === 'failed');
  if (!failed.length)
    return allTests.length
      ? '<p class="muted">No failed tests in this run.</p>'
      : '';
  return `<div class="scroll"><table><thead><tr><th>Test</th><th>Where</th><th>Error</th></tr></thead><tbody>${failed
    .map(
      (t) =>
        `<tr><td>${esc(t.name)}</td><td><code>${esc(t.key)}</code></td><td><pre>${esc(t.message ?? '')}</pre></td></tr>`,
    )
    .join('')}</tbody></table></div>`;
}

// ---- Coverage and tests per feature ----

const lcov = (path: string) => {
  const text = read(path);
  return text === undefined ? undefined : parseLcov(text);
};
const files = {
  api: lcov('apps/api/coverage/lcov.info'),
  web: lcov('apps/web/coverage/lcov.info'),
  apiE2e: lcov('apps/api/coverage-e2e/lcov.info'),
};
const gates: Record<App, Map<string, Gate>> = {
  api: readGates(read('apps/api/vitest.config.ts') ?? ''),
  web: readGates(read('apps/web/vite.config.ts') ?? ''),
};
const cells = (c: Coverage) =>
  `<td>${fmt(pct(c.lines))}</td><td>${fmt(pct(c.branches))}</td><td>${fmt(pct(c.functions))}</td>`;

// How many tests of each kind go with a feature
function testCounts(feature: string) {
  const unit = [...tests.unitApi, ...tests.unitWeb].filter(
    (t) =>
      testFeature(t.key.startsWith('web/') ? 'web' : 'api', t.key.slice(4)) ===
      feature,
  ).length;
  const e2e = tests.e2e.filter(
    (t) => testFeature('api', t.key.slice(4)) === feature,
  ).length;
  const browser = tests.browser.filter((t) =>
    featuresOfTags(t.tags).includes(feature),
  ).length;
  return { unit, e2e, browser };
}

// One row per feature: its tests, then the API (unit and e2e) and web coverage
function featureTable() {
  const api = files.api && byFeature('api', files.api);
  const apiE2e = files.apiE2e && byFeature('api', files.apiE2e);
  const web = files.web && byFeature('web', files.web);
  const lines = (c?: Coverage) =>
    c ? `<td>${fmt(pct(c.lines))}</td>` : '<td class="muted">–</td>';
  const branches = (c?: Coverage) =>
    c ? `<td>${fmt(pct(c.branches))}</td>` : '<td class="muted">–</td>';
  const count = ({ unit, e2e, browser }: ReturnType<typeof testCounts>) =>
    `<td class="nums">${unit} · ${e2e} · ${browser}</td>`;
  const names = [...FEATURES.map((f) => f.name), OTHER];
  const what = new Map(FEATURES.map((f) => [f.name, f.what]));
  const rows = names
    .filter(
      (n) =>
        n !== OTHER ||
        api?.has(n) ||
        web?.has(n) ||
        testCounts(n).unit + testCounts(n).e2e > 0,
    )
    .map(
      (n) =>
        `<tr><td><strong>${n}</strong><br><span class="muted">${what.get(n) ?? 'Files no feature lists yet (qa/features.ts)'}</span></td>${count(testCounts(n))}${lines(api?.get(n))}${branches(api?.get(n))}${lines(apiE2e?.get(n))}${lines(web?.get(n))}${branches(web?.get(n))}</tr>`,
    )
    .join('');
  const sum = (fs?: FileCoverage[]) => (fs ? total(fs) : undefined);
  const allCount = {
    unit: tests.unitApi.length + tests.unitWeb.length,
    e2e: tests.e2e.length,
    browser: tests.browser.length,
  };
  const totals = `<tr class="total"><td>Whole app</td>${count(allCount)}${lines(sum(files.api))}${branches(sum(files.api))}${lines(sum(files.apiE2e))}${lines(sum(files.web))}${branches(sum(files.web))}</tr>`;
  return `<div class="scroll"><table><thead>
    <tr><th></th><th></th><th colspan="2">API unit</th><th>API e2e</th><th colspan="2">Web</th></tr>
    <tr><th>Feature</th><th>Tests: unit · e2e · browser</th><th>Lines</th><th>Branches</th><th>Lines</th><th>Lines</th><th>Branches</th></tr>
    </thead><tbody>${rows}${totals}</tbody></table></div>
    <p class="muted">A browser test goes through several features, so it counts once in each.
    The end-to-end coverage has no gate: it shows what the real routes and database
    reach, including the module wiring the unit tests leave out.</p>`;
}

// The gates as CI checks them: API per business folder, web for the whole app
function gateSummary() {
  const parts: string[] = [];
  if (files.api) {
    const folders = byFolder(files.api);
    const gated = [...gates.api].filter(([folder]) => folder);
    const below = gated.filter(([folder, gate]) => {
      const c = folders.get(folder);
      return !c || !meetsGate(c, gate);
    });
    parts.push(
      `API, each business folder: ${gated.length - below.length} of ${gated.length} pass ${badge(!below.length, 'Pass', 'Below gate')}` +
        (below.length
          ? ` <span class="muted">(${below.map(([f]) => `${esc(f)}: ${featureOf('api', `${f}/`)}`).join(', ')})</span>`
          : ''),
    );
  }
  const whole = gates.web.get('');
  if (files.web && whole)
    parts.push(
      `Web, whole app (${whole.lines}% / ${whole.branches}%): ${badge(meetsGate(total(files.web), whole), 'Pass', 'Below gate')}`,
    );
  return parts.length
    ? `<ul class="gates">${parts.map((p) => `<li>${p}</li>`).join('')}</ul>`
    : '';
}

// Every folder against its gate, folded away under the feature table
function folderTable(
  fs: FileCoverage[] | undefined,
  gate: Map<string, Gate>,
  title: string,
  note: string,
) {
  if (!fs)
    return `<p class="muted">${title}: no coverage, the test job did not finish.</p>`;
  const gateCells = (c: Coverage, g?: Gate) =>
    g
      ? `<td>${g.lines}% / ${g.branches}%</td><td>${badge(meetsGate(c, g), 'Pass', 'Below gate')}</td>`
      : '<td class="muted">not gated</td><td></td>';
  const rows = [...byFolder(fs)]
    .map(
      ([folder, c]) =>
        `<tr><td><code>${esc(folder)}</code></td>${cells(c)}${gateCells(c, gate.get(folder))}</tr>`,
    )
    .join('');
  const sum = total(fs);
  const totalRow = `<tr class="total"><td>All ${fs.length} files</td>${cells(sum)}${gateCells(sum, gate.get(''))}</tr>`;
  return `<details><summary>${title} by folder</summary>
    <p class="muted">${note}</p>
    <div class="scroll"><table><thead><tr><th>Folder</th><th>Lines</th><th>Branches</th><th>Functions</th><th>Gate (lines / branches)</th><th></th></tr></thead>
    <tbody>${rows}${totalRow}</tbody></table></div></details>`;
}

// ---- Requirements and their tests ----

function requirementsTable() {
  if (!allTests.length)
    return '<p class="muted">No test results in this run.</p>';
  const rows = REQUIREMENTS.map((r) => {
    const c = checkRequirement(r, allTests);
    const ran = c.passed + c.failed;
    const ok = c.failed ? false : c.missing.length || !ran ? undefined : true;
    const list = r.tests
      .map(
        (t) =>
          `<li><code>${esc(t)}</code>${c.missing.includes(t) ? ' <span class="muted">(not in this run)</span>' : ''}</li>`,
      )
      .join('');
    return `<tr><td><strong>${r.id}</strong></td><td><strong>${r.title}</strong><br><span class="muted">${esc(r.text)}</span></td>
      <td class="nums">${c.passed} / ${ran}${c.failed ? ` · ${c.failed} failed` : ''}
      <details class="plain"><summary>${plural(r.tests.length, 'test file')}</summary><ul>${list}</ul></details></td>
      <td>${badge(ok)}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table><thead><tr><th>ID</th><th>Requirement (report 6.1)</th><th>Tests passed</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---- The other checks ----

function accessibility() {
  const axe = tests.browser.filter((t) => t.tags.includes('@a11y'));
  if (!axe.length) return '<p class="muted">Not run.</p>';
  const t = tally(axe);
  return `<p>${badge(!t.failed, 'No violations', 'Violations found')} axe (WCAG 2.1 A and AA) on the main screens, in ${plural(axe.length, 'browser')}: ${t.passed} of ${axe.length} passed.
    Any violation fails the browser-test job, a required check. Details are in the <a href="browser-tests/index.html">browser-test report</a>.</p>`;
}

function mutation() {
  const report = readJson('apps/api/reports/mutation/mutation.json');
  if (!report) return '<p class="muted">Not run.</p>';
  const m = mutationScore(report);
  return `<p class="big">${fmt(m.score)}<span> mutation score</span></p>
    <p>Stryker made ${m.killed + m.timeout + m.survived + m.noCoverage} small changes (mutants) to <code>src/split</code>, the money maths, and ran the tests against each.
    ${m.killed + m.timeout} were caught by a failing test, ${m.survived} survived${m.noCoverage ? ` and ${m.noCoverage} had no test running them` : ''}.
    A survivor is a change no test notices. <a href="mutation.html">Mutation report</a></p>`;
}

function lighthouse() {
  const report = readJson('scan/lighthouse.report.json');
  if (!report) return '<p class="muted">Not run.</p>';
  const scores = lighthouseScores(report)
    .map(
      (s) =>
        `<div class="card"><h3>${esc(s.title)}</h3><p class="big">${s.score ?? '–'}<span> / 100</span></p></div>`,
    )
    .join('');
  return `<div class="cards">${scores}</div>
    <p class="muted">The login page on a simulated phone, against the CI copy of the app (plain HTTP on localhost, so the HTTPS audits can't pass there).
    <a href="lighthouse.html">Lighthouse report</a></p>`;
}

function zap() {
  const report = readJson('scan/zap.json');
  if (!report) return '<p class="muted">Not run.</p>';
  const { alerts, byRisk } = zapAlerts(report);
  const summary = RISKS.map((r, i) => `${r}: ${byRisk[i]}`)
    .reverse()
    .join(' · ');
  const rows = alerts
    .map(
      (a) =>
        `<tr><td>${esc(a.name)}</td><td>${RISKS[a.risk]}</td><td class="nums">${a.count}</td></tr>`,
    )
    .join('');
  return `<p>${badge(!byRisk[3] && !byRisk[2], 'No high or medium', 'High or medium found')} ${summary}</p>
    <p class="muted">An OWASP ZAP baseline scan: it crawls the running app in CI and checks every response
    (headers, cookies, errors) without attacking it. <a href="zap.html">ZAP report</a></p>
    ${rows ? `<details><summary>${plural(alerts.length, 'alert')}</summary><div class="scroll"><table><thead><tr><th>Alert</th><th>Risk</th><th>Places</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : ''}`;
}

// The jobs the QA report job waited for (`needs`, passed in by CI)
const JOBS: Record<string, string> = {
  gitleaks: 'Secrets in the git history (Gitleaks)',
  lint: 'Lint, format, type check and build (api, web)',
  'test-api': 'API unit tests and coverage gates',
  'test-web': 'Web tests and coverage gate',
  'test-e2e': 'API end-to-end tests (Postgres 18)',
  'e2e-browser': 'Browser tests and accessibility (axe)',
  'docker-build': 'Docker images build',
  'npm-audit': 'Known vulnerabilities in packages (npm audit)',
  trivy: 'Known vulnerabilities in the images (Trivy)',
  mutation: 'Mutation testing (Stryker)',
  'web-scan': 'Security scan (ZAP) and Lighthouse',
};
function pipelineChecks() {
  if (!env.NEEDS) return '<p class="muted">Only shown for a CI run.</p>';
  const rows = jobResults(JSON.parse(env.NEEDS))
    .map(
      ({ job, result }) =>
        `<tr><td>${esc(JOBS[job] ?? job)}</td><td><code>${esc(job)}</code></td><td>${result === 'skipped' ? '<span class="badge none">Skipped</span>' : badge(result === 'success')}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>Check</th><th>Job</th><th></th></tr></thead><tbody>${rows}
    <tr><td>Code scanning (CodeQL, its own workflow)</td><td><code>codeql</code></td><td><a href="${repo}/security/code-scanning">Security tab</a></td></tr>
    </tbody></table></div>`;
}

// ---- Markdown pages ----

// Relative links are fixed for the site (qa/links.ts)
marked.use({
  walkTokens(token) {
    if (token.type === 'link' || token.type === 'image')
      token.href = siteLink(token.href, `${repo}/blob/${ref}`);
  },
});
const markdown = (path: string) =>
  marked.parse(read(path) ?? '', { async: false });

// ---- Page ----

const when = new Date().toLocaleString('en-SG', {
  timeZone: 'Asia/Singapore',
  dateStyle: 'medium',
  timeStyle: 'short',
});
const short = ref === 'main' ? 'main' : ref.slice(0, 7);
const run = env.GITHUB_RUN_ID
  ? ` · <a href="${repo}/actions/runs/${env.GITHUB_RUN_ID}">CI run</a>`
  : ' · local build';

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  /* Colours from docs/ui-design.md, so the report looks like SplitLah */
  :root { color-scheme: dark; --bg: #080B18; --glass: #161927; --line: #262A3D; --ink: #F5F6FB;
    --muted: #A8AEC4; --ok: #D9EE6A; --bad: #FF8F8F; --link: #A78BFA; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); line-height: 1.55;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 4px; }
  h2 { font-size: 1.4rem; font-weight: 600; margin: 48px 0 12px; }
  h3 { font-size: 1.05rem; font-weight: 600; margin: 24px 0 4px; }
  a { color: var(--link); }
  code { font-size: 0.9em; }
  pre { white-space: pre-wrap; margin: 0; font-size: 0.85em; }
  .muted { color: var(--muted); margin: 4px 0; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .card { background: var(--glass); border: 1px solid var(--line); border-radius: 20px; padding: 16px 18px; }
  .card .row { margin: 0; flex-wrap: nowrap; align-items: flex-start; }
  .card h3 { margin: 0; }
  .card p { margin: 4px 0; }
  .big { font-size: 2rem; font-weight: 600; margin: 8px 0 0 !important; }
  .big span { font-size: 1rem; font-weight: 400; color: var(--muted); }
  .badge { font-size: 0.8rem; font-weight: 600; padding: 2px 10px; border-radius: 99px; white-space: nowrap; }
  .badge.ok { color: var(--ok); background: rgb(217 238 106 / 0.1); }
  .badge.bad { color: var(--bad); background: rgb(255 143 143 / 0.1); }
  .badge.none { color: var(--muted); background: rgb(168 174 196 / 0.1); }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.92rem; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 500; }
  td.nums { white-space: nowrap; }
  tr.total td { font-weight: 600; }
  .gates { padding-left: 20px; margin: 12px 0; }
  .gates li { margin: 4px 0; }
  details { margin-top: 12px; background: var(--glass); border: 1px solid var(--line); border-radius: 16px; padding: 10px 16px; }
  details.plain { background: none; border: 0; padding: 0; margin-top: 4px; font-weight: 400; }
  details.plain ul { padding-left: 18px; margin: 4px 0; white-space: normal; }
  summary { cursor: pointer; font-weight: 600; }
  details.plain summary { font-weight: 400; color: var(--muted); }
  .doc { margin-top: 56px; border-top: 1px solid var(--line); }
  .doc table { display: block; overflow-x: auto; }
  .doc pre { background: var(--glass); padding: 12px; border-radius: 12px; overflow-x: auto; }
</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}

const index = page(
  'SplitLah QA report',
  `<h1>SplitLah QA report</h1>
  <p class="muted">Built from <a href="${repo}/commit/${ref}"><code>${short}</code></a> on ${when}${run}.
  Every merge to <code>main</code> runs all the checks again and replaces this page.</p>

  <h2>Test results</h2>
  <div class="cards">${suites.map(suiteCard).join('')}</div>
  <h3>Failed tests</h3>
  ${failedTests()}

  <h2>Coverage and tests by feature</h2>
  <p class="muted">Coverage is read from the <code>lcov.info</code> file each test run writes, and the tests
  from their JSON results (<a href="${repo}/blob/${ref}/qa/features.ts">which files are in each feature</a>).</p>
  ${featureTable()}
  <h3>Gates</h3>
  <p class="muted">CI fails the pull request if any of these is below 90% lines or branches.</p>
  ${gateSummary()}
  ${folderTable(files.api, gates.api, 'API unit', 'Each business folder has its own gate. Modules and main.ts are left out: the end-to-end tests prove the wiring.')}
  ${folderTable(files.apiE2e, new Map(), 'API end-to-end', 'No gate: the real routes against a real database, including the module wiring.')}
  ${folderTable(files.web, gates.web, 'Web', 'One gate for the whole app; folders are shown so a weak one is visible.')}
  <p>Line-by-line: <a href="coverage/api/index.html">API unit</a> · <a href="coverage/api-e2e/index.html">API end-to-end</a> · <a href="coverage/web/index.html">Web</a>
  <span class="muted">(every file, with the lines no test runs marked in red)</span></p>

  <h2>Requirements and their tests</h2>
  <p class="muted">Each functional requirement in the report and the tests that prove it, with their results in this run
  (<a href="${repo}/blob/${ref}/qa/requirements.ts">the list</a>).</p>
  ${requirementsTable()}

  <h2>Other checks</h2>
  <h3>Accessibility</h3>
  ${accessibility()}
  <h3>Mutation testing</h3>
  ${mutation()}
  <h3>Security scan of the running app</h3>
  ${zap()}
  <h3>Web performance and best practice (Lighthouse)</h3>
  ${lighthouse()}
  <h3>Every pipeline check in this run</h3>
  ${pipelineChecks()}

  <h2>More results</h2>
  <ul>
    <li><a href="receipts.html">Receipt reading accuracy</a> (Gemini, 5 real receipts, 9 Nov; needs the real AI, so it is not run in CI)</li>
    <li><a href="results/k6-2026-11-22.txt">k6 load test on the live site</a> (22 Nov; run by hand so normal work never loads the live server)</li>
    <li><a href="${repo}/blob/${ref}/docs/security.md">Security scans and OWASP checklist</a></li>
  </ul>

  <article class="doc">${markdown('qa/qa-report.md')}</article>`,
);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), index);
writeFileSync(
  join(out, 'receipts.html'),
  page(
    'Receipt reading accuracy',
    `<p><a href="index.html">← QA report</a></p>${markdown('qa/ocr-accuracy.md')}`,
  ),
);
const copies: [string, string][] = [
  ['apps/api/coverage/lcov-report', 'coverage/api'],
  ['apps/api/coverage-e2e/lcov-report', 'coverage/api-e2e'],
  ['apps/web/coverage/lcov-report', 'coverage/web'],
  ['apps/web/playwright-report', 'browser-tests'],
  ['qa/results', 'results'],
];
for (const [from, to] of copies)
  if (existsSync(at(from)))
    cpSync(at(from), join(out, to), { recursive: true });
const pages: [string, string][] = [
  ['apps/api/reports/mutation/mutation.html', 'mutation.html'],
  ['scan/lighthouse.report.html', 'lighthouse.html'],
  ['scan/zap.html', 'zap.html'],
];
for (const [from, to] of pages)
  if (existsSync(at(from))) copyFileSync(at(from), join(out, to));

console.log(
  `QA report written to qa/site (${suites.filter((s) => s.suite).length} of ${suites.length} test suites, ${allTests.length} tests)`,
);
