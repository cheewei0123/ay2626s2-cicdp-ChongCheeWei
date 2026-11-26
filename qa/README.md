# QA

Everything about checking the quality of SplitLah in one place (KAN-102). The tests themselves stay next to the code they test (`apps/*/src/**/*.spec.ts`, `*.test.tsx`, `apps/api/test`, `apps/web/e2e`).

**Published report:** https://cheewei0123.github.io/ay2626s2-cicdp-ChongCheeWei/, rebuilt by CI after every merge to `main`.

| Path                                                               | What it is                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [qa-report.md](qa-report.md)                                       | The QA report: strategy, results, defects found by testing, manual checks, known gaps                 |
| [report.ts](report.ts)                                             | Builds the report site in `qa/site` from the test results and `lcov.info` coverage files              |
| [lcov.ts](lcov.ts), [results.ts](results.ts), [links.ts](links.ts) | Reading lcov and the JSON test results; fixing links for the site (tested in `report.test.ts`)        |
| [features.ts](features.ts)                                         | Which files and tests belong to which feature, for the coverage-and-tests-by-feature table            |
| [requirements.ts](requirements.ts)                                 | FR1 to FR11 from the report and the tests that prove each one, for the requirements table             |
| [scans.ts](scans.ts)                                               | Reading the Lighthouse, ZAP and Stryker reports and each CI job's result (tested in `checks.test.ts`) |
| [../apps/api/stryker.config.json](../apps/api/stryker.config.json) | Stryker mutation testing of the split engine (`src/split`)                                            |
| [ocr-accuracy.md](ocr-accuracy.md)                                 | How well Gemini reads 5 real receipts                                                                 |
| [scripts/try-receipt.mjs](scripts/try-receipt.mjs)                 | Sends one receipt photo to the real OCR service (used for the accuracy test)                          |
| [k6/smoke.js](k6/smoke.js)                                         | The k6 load test, run by hand from the `k6` workflow                                                  |
| [results/](results/)                                               | Saved output: the k6 run and an API coverage table from 22 Nov                                        |

## How the report is built

1. The test jobs write coverage as **lcov** (`coverage/lcov.info` and the HTML in `coverage/lcov-report`) and their counts as JSON (`--reporter=json` in Vitest, the `json` reporter in Playwright).
2. The `QA report` CI job downloads those files, plus the API e2e coverage (`coverage-e2e`), the Stryker report (`mutation` job) and the ZAP and Lighthouse reports (`web-scan` job), and runs `qa/report.ts`. It gets each CI job's result from `toJSON(needs)`. It adds up `lcov.info` per feature (both apps side by side) and per folder, checks each folder against the gate in the Vitest config, and writes `index.html`. It renders this folder's Markdown with `marked` and copies the HTML coverage and Playwright reports.
3. On `main`, the `publish QA report` job publishes `qa/site` to GitHub Pages.

Locally, after running the tests:

```bash
npm run test:cov -w apps/api -- --reporter=default --reporter=json --outputFile.json=test-results.json
npm test -w apps/web -- --reporter=default --reporter=json --outputFile.json=test-results.json
npm run qa:report        # then open qa/site/index.html
npm run qa:test          # tests for the lcov, results and scan parsing
npx stryker run          # in apps/api: mutation testing, report in apps/api/reports/mutation
```

The report code is TypeScript that Node 24 runs directly (it strips the types), so there is no build step; `npm run qa:typecheck` checks the types.
