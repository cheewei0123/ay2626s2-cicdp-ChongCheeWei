// Builds the QA report site that CI publishes to GitHub Pages (KAN-102).
// It reads what the test jobs wrote and puts it in qa/site:
//   index.html      test results, coverage per folder against the gates, then qa-report.md
//   receipts.html   ocr-accuracy.md
//   coverage/api, coverage/web   the HTML coverage reports (lcov-report)
//   browser-tests   Playwright's HTML report
//   results         the saved k6 and coverage text files
// Run after the tests (see qa/README.md): npm run qa:report
import {
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
import type { Coverage, Gate } from './lcov.ts';
import { siteLink } from './links.ts';
import { fromPlaywright, fromVitest } from './results.ts';
import type { Suite } from './results.ts';

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

// ---- Tests ----

type Row = { name: string; what: string; suite?: Suite; report?: string };
const vitest = (path: string) => {
  const json = readJson(path);
  return json && fromVitest(json);
};
const playwright = readJson('apps/web/playwright-results.json');
const suites: Row[] = [
  {
    name: 'API unit',
    what: 'Vitest',
    suite: vitest('apps/api/test-results.json'),
  },
  {
    name: 'Web unit and component',
    what: 'Vitest + Testing Library',
    suite: vitest('apps/web/test-results.json'),
  },
  {
    name: 'API end-to-end',
    what: 'Vitest + Supertest, Postgres 18',
    suite: vitest('apps/api/e2e-results.json'),
  },
  {
    name: 'Browser (iPhone 14, WebKit)',
    what: 'Playwright on the Docker images',
    suite: playwright && fromPlaywright(playwright),
    report: existsSync(at('apps/web/playwright-report'))
      ? 'browser-tests/index.html'
      : undefined,
  },
];

const badge = (ok: boolean | undefined, yes = 'Pass', no = 'Fail') =>
  ok === undefined
    ? '<span class="badge none">Not run</span>'
    : `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? yes : no}</span>`;

function suiteCard({ name, what, suite, report }: Row) {
  const body = suite
    ? `<p class="big">${suite.passed}<span> / ${suite.total} passed</span></p>
       <p class="muted">${suite.files} files${suite.failed ? ` · ${suite.failed} failed` : ''}${suite.skipped ? ` · ${suite.skipped} skipped` : ''}</p>`
    : '<p class="big">–</p><p class="muted">No results: the job did not finish</p>';
  const link = report ? `<p><a href="${report}">Open the report</a></p>` : '';
  return `<div class="card"><div class="row"><h3>${name}</h3>${badge(suite?.ok)}</div>
    <p class="muted">${what}</p>${body}${link}</div>`;
}

// ---- Coverage ----

function coverageSection(
  title: string,
  app: string,
  config: string,
  note: string,
) {
  const lcov = read(`apps/${app}/coverage/lcov.info`);
  if (!lcov)
    return `<h3>${title}</h3><p class="muted">No coverage: the test job did not finish.</p>`;
  const files = parseLcov(lcov);
  const gates = readGates(read(config) ?? '');
  const sum = total(files);
  const cells = (c: Coverage) =>
    `<td>${fmt(pct(c.lines))}</td><td>${fmt(pct(c.branches))}</td><td>${fmt(pct(c.functions))}</td>`;
  const gateCells = (c: Coverage, gate?: Gate) =>
    gate
      ? `<td>${gate.lines}% / ${gate.branches}%</td><td>${badge(meetsGate(c, gate), 'Pass', 'Below gate')}</td>`
      : '<td class="muted">not gated</td><td></td>';
  const rows = [...byFolder(files)]
    .map(
      ([folder, c]) =>
        `<tr><td><code>${esc(folder)}</code></td>${cells(c)}${gateCells(c, gates.get(folder))}</tr>`,
    )
    .join('');
  const totalRow = `<tr class="total"><td>All ${files.length} files</td>${cells(sum)}${gateCells(sum, gates.get(''))}</tr>`;
  return `<div class="row"><h3>${title}</h3><a href="coverage/${app}/index.html">Line-by-line report</a></div>
    <p class="muted">${note}</p>
    <div class="scroll"><table><thead><tr><th>Folder</th><th>Lines</th><th>Branches</th><th>Functions</th><th>Gate (lines / branches)</th><th></th></tr></thead>
    <tbody>${rows}${totalRow}</tbody></table></div>`;
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
  h3 { font-size: 1.05rem; font-weight: 600; margin: 0; }
  a { color: var(--link); }
  code { font-size: 0.9em; }
  .muted { color: var(--muted); margin: 4px 0; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .card { background: var(--glass); border: 1px solid var(--line); border-radius: 20px; padding: 16px 18px; }
  .card .row { margin: 0; flex-wrap: nowrap; align-items: flex-start; }
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
  tr.total td { font-weight: 600; }
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
  Every merge to <code>main</code> runs all the tests again and replaces this page.</p>

  <h2>Test results</h2>
  <div class="cards">${suites.map(suiteCard).join('')}</div>

  <h2>Coverage</h2>
  <p class="muted">Read from the <code>lcov.info</code> file each test run writes. CI fails the
  pull request if a gated folder is below its gate.</p>
  ${coverageSection('API', 'api', 'apps/api/vitest.config.ts', 'Each business folder has its own gate. Modules and main.ts are left out: the end-to-end tests prove the wiring.')}
  ${coverageSection('Web', 'web', 'apps/web/vite.config.ts', 'One gate for the whole app; folders are shown so a weak one is visible.')}

  <h2>More results</h2>
  <ul>
    <li><a href="receipts.html">Receipt reading accuracy</a> (Gemini, 5 real receipts)</li>
    <li><a href="results/k6-2026-11-22.txt">k6 load test on the live site</a> (22 Nov)</li>
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
  ['apps/web/coverage/lcov-report', 'coverage/web'],
  ['apps/web/playwright-report', 'browser-tests'],
  ['qa/results', 'results'],
];
for (const [from, to] of copies)
  if (existsSync(at(from)))
    cpSync(at(from), join(out, to), { recursive: true });

console.log(
  `QA report written to qa/site (${suites.filter((s) => s.suite).length} of ${suites.length} test suites found)`,
);
