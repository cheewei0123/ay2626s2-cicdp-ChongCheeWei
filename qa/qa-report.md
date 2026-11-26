# QA report

What was tested, how, the results, the bugs testing found, and what is still not tested.

**Live results.** CI publishes this report to [GitHub Pages](https://cheewei0123.github.io/ay2626s2-cicdp-ChongCheeWei/) after every merge to `main` (KAN-102). The top of that page is built by [`report.ts`](report.ts) from the run itself: the test counts, the coverage of every folder against its gate (read from `lcov.info`), and links to the line-by-line coverage and the browser-test report. The numbers below are from `main` at `5bd774d` on 26 Nov 2026 unless a date says otherwise.

## Summary

| Area                              | Result                                                                                                     | Status                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| API unit tests                    | 544 tests in 54 files, all pass; 98.4% lines, 95.9% branches                                               | Pass                       |
| Web tests                         | 256 tests in 22 files, all pass; 99.0% lines, 97.3% branches                                               | Pass                       |
| API end-to-end tests              | 122 tests in 22 files against a real Postgres 18, all pass in CI                                           | Pass                       |
| Browser tests (iPhone 14, WebKit) | 3 tests on the real Docker images, all pass in CI                                                          | Pass                       |
| Split correct to the cent         | The brief's bill gives 720 / 899 / 959 / 959 = 3,537 cents; 1,000 random bills add up exactly on every run | Pass                       |
| Coverage gate                     | 90% lines and branches per business folder (API) and for the whole web app; CI fails below                 | Pass                       |
| Load (k6, live site, 10 users)    | p95 229.71 ms (target under 500 ms), 0% failed                                                             | Pass                       |
| Rate limit (k6, live site)        | Join-code guesses: first 20 get `404`, the rest `429`                                                      | Pass                       |
| Receipt reading (Gemini)          | 35 / 35 items, 5 / 5 totals on 5 real receipts                                                             | Pass                       |
| Security scans                    | 0 HIGH or CRITICAL with a fix in both images; npm audit clean; CodeQL findings fixed                       | Pass                       |
| PayNow QR in a real bank app      | Not tested                                                                                                 | Gap (see Known gaps)       |
| SMS code on the live site         | Not possible on the free AWS plan; Telegram is used instead                                                | Gap (replaced by Telegram) |

## Test strategy

A test pyramid: many fast tests at the bottom, fewer slow ones at the top. Every level runs on every pull request, and 13 required checks must pass before a merge ([pipeline.md](../docs/pipeline.md)).

| Level                  | Tool                               | What it proves                                                                                             | Where                               |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Unit (API)             | Vitest                             | Logic on its own, with fakes for the database and outside services                                         | `apps/api/src/**/*.spec.ts`         |
| Property               | fast-check                         | Rules that must hold for any bill: shares add up to the total, nothing negative (1,000 random bills a run) | `apps/api/src/split`                |
| Unit / component (web) | Vitest + React Testing Library     | Screens behave as a user sees them; elements found by role and name, like a screen reader                  | `apps/web/src/**/*.test.tsx`        |
| API end-to-end         | Vitest + Supertest + Postgres 18   | Real routes, guards, validation, database and migrations together                                          | `apps/api/test/*.e2e-spec.ts`       |
| Browser                | Playwright, iPhone 14 (WebKit)     | Owner and guest journeys on the same images as production, through Caddy                                   | `apps/web/e2e/split-a-bill.spec.ts` |
| Load                   | k6                                 | Response time and errors on the live server; rate limit works through Caddy                                | `qa/k6/smoke.js` (run by hand)      |
| Accuracy               | `qa/scripts/try-receipt.mjs`       | How well Gemini reads real receipts                                                                        | [ocr-accuracy.md](ocr-accuracy.md)  |
| Security               | Gitleaks, npm audit, Trivy, CodeQL | Leaked secrets, vulnerable packages, vulnerable image contents, unsafe code and workflows                  | [security.md](../docs/security.md)  |

**Fakes keep tests fast, free and repeatable.** Gemini, Gmail, SNS and Telegram each sit behind an interface (ADR 003, ADR 004). Tests and CI use a Fake, so no test calls a paid or outside service and every run gives the same answer. The browser test reads the verify link from the API log written by the Fake email sender.

**Test data.** Each e2e test file makes its own users with unique emails and deletes them afterwards, because test files run in parallel. The CI database is thrown away after each run.

**Test-driven development.** The service charge and GST code (KAN-19) and the split engine (KAN-20) were written test first; the red and green runs are in [`docs/evidence`](../docs/evidence/) (`kan-19-*.png`, `kan-20-*.png`).

## Results

### Automated tests

| Suite            | Files | Tests | Lines  | Branches |
| ---------------- | ----- | ----- | ------ | -------- |
| API unit         | 54    | 544   | 98.44% | 95.94%   |
| Web              | 22    | 256   | 99.00% | 97.31%   |
| API end-to-end   | 22    | 122   | n/a    | n/a      |
| Browser (WebKit) | 1     | 3     | n/a    | n/a      |

The browser tests: the web server sends the security headers; the owner registers, verifies the email, scans a receipt, fixes an item, shares the bill and pins it on My bills; a guest joins with the code, claims every item and sees the same total as the owner.

### Coverage by folder (API, gated at 90%)

| Folder         | Lines  | Branches |
| -------------- | ------ | -------- |
| `src/split`    | 100%   | 98.14%   |
| `src/auth`     | 99.75% | 97.56%   |
| `src/bills`    | 98.11% | 96.29%   |
| `src/expenses` | 100%   | 98.64%   |
| `src/ocr`      | 98.30% | 95.34%   |
| `src/payments` | 100%   | 97.05%   |

`src/common` and `src/receipts` are gated too and pass; Vitest's table leaves out folders that are fully covered. The gate was proved by hiding the split tests: `test:cov` failed with `Coverage for lines (14.45%) does not meet "src/split/**" threshold (90%)` (KAN-21). A coverage table from 22 Nov is saved in [results/api-coverage-2026-11-22.txt](results/api-coverage-2026-11-22.txt); the published page always has the latest.

### Performance (k6 on the live site, 22 Nov)

| Measure           | Result               | Target / note                              |
| ----------------- | -------------------- | ------------------------------------------ |
| Virtual users     | 10 for 1 minute      | From GitHub's US runner to Singapore       |
| p95 response time | 229.71 ms            | Under 500 ms                               |
| Failed requests   | 0%                   | Under 1%                                   |
| API CPU           | 2–3%                 | t3.micro                                   |
| Memory in use     | about 500 of 909 MiB | The tightest resource; swap already in use |

p50 and p95 were only about 5 ms apart, so most of the time is the trip across the Pacific, not the server. Full output: [results/k6-2026-11-22.txt](results/k6-2026-11-22.txt). The script is [k6/smoke.js](k6/smoke.js).

### Receipt reading (9 Nov)

35 of 35 items and 5 of 5 totals correct on a kopitiam, a food court, McDonald's, a café and NTUC FairPrice receipt, about 2 seconds each. Each receipt that went wrong at first led to a change in the prompt or the checks. Details: [ocr-accuracy.md](ocr-accuracy.md).

### Security

| Scan      | Result                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gitleaks  | No secrets in the git history (one false positive in the Nest CLI's README listed by fingerprint)                                                                                                                                                             |
| npm audit | No HIGH or CRITICAL advisories (one accepted with a reason and review date in `audit-ci.jsonc`)                                                                                                                                                               |
| Trivy     | 8 HIGH found over time: 6 in the API image (the npm program inside the Node base image) and 2 in the web image (Caddy's binary, one published after the first scan). Fixed by removing npm from the runtime image and rebuilding Caddy with a fixed Go. Now 0 |
| CodeQL    | 3 workflow findings on the first run (missing permissions, actions on movable tags): fixed by hand                                                                                                                                                            |

The OWASP Top 10 checklist is in [security.md](../docs/security.md).

## Defects found by testing

Bugs that a test or a check caught before users did. Each one is in the [learning log](../docs/learning-log.md) under its ticket.

| Defect                                                                              | Found by                                 | Fix                                                 | Ticket  |
| ----------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- | ------- |
| Split crashed on a very large bill: numbers grew past what JavaScript holds exactly | Property test (fast-check)               | `BigInt` for that step, plus a regression test      | KAN-21  |
| Summary listed the owner last instead of first, except on the first call            | API e2e test                             | Owner always first                                  | KAN-29  |
| The image ran with the wrong `dotenv` version and only worked by luck               | Container crash after slimming the image | Copy both `node_modules` folders                    | KAN-36  |
| An Express 5 route parameter had the wrong type                                     | Type check in CI (all tests had passed)  | Correct type                                        | KAN-26  |
| Scanned receipts: discounts, "2 FOR $7.95" deals, GST already inside prices         | Accuracy test on real receipts           | Prompt rules; compare the total with the items' sum | KAN-33  |
| A test pattern change quietly dropped a test file                                   | Web test count fell from 168 to 164      | Pattern includes root `*.test.ts`                   | KAN-53  |
| One wrong current password logged the user out (`401`)                              | Found while testing two-step login       | Answer `403` for wrong passwords while logged in    | KAN-92  |
| "Account deleted" message lost to the app's own logout redirect                     | Web test                                 | Message kept in the auth context                    | KAN-93  |
| Google's button never came back after its script failed to load once                | Web test that fails the load first       | Reset after the failure is stored                   | KAN-95  |
| GST added on top of receipts that already include it                                | Real scans                               | Pick the closest of four charge choices             | KAN-98  |
| A photo that is not a receipt became a made-up bill                                 | Real scans                               | `isReceipt` in the answer; `422 No receipt found`   | KAN-99  |
| After a touch swipe, the next real tap on a bill was swallowed                      | Web test                                 | Reset the flag on every new touch                   | KAN-101 |
| Hovering the mouse over a bill slid it open                                         | Using the live site with a mouse         | Only swipe while a pointer is pressed; 2 tests      | KAN-101 |
| `vitest` and its coverage plugin on different versions after Dependabot updates     | `test-web` red on the Dependabot PRs     | Update both together; `npm dedupe`                  | KAN-22  |

Some checks were run the other way round, to prove a gate works: a broken split engine (PR #45) turned `test-api` and `test-e2e` red and disabled the merge button; a fake key was blocked by push protection and Gitleaks; a lint error blocked a PR. Screenshots are in [docs/evidence](../docs/evidence/).

## Manual checks

Things a test can't see, checked by hand.

| Check                                                               | Result                                                                                | Evidence                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| The brief's bill through the real API (Chee, Ali, Ben, Dan)         | $7.20, $8.99, $9.59, $9.59 = $35.37                                                   | KAN-45 learning-log entry                   |
| HTTPS on an iPhone                                                  | No warning; certificate kept after a restart                                          | `kan-39-iphone-https.png`                   |
| Install to the home screen, open full screen                        | Works                                                                                 | `kan-46-iphone-*.png`                       |
| Offline: the app shell opens, but bills are never served from cache | `fetch('/api/health')` fails offline instead of returning an old answer               | KAN-46 learning-log entry (checked in Edge) |
| Verification email from the live site                               | Arrived through Gmail; the link verified the account on the iPhone                    | `kan-77-verification-email.png`             |
| Swipe on My bills (pin, share, delete, undo, locked bill)           | All work on the local production stack                                                | KAN-101 learning-log entry                  |
| After every deploy                                                  | `/api/health` answers `{"status":"ok","db":"up"}`; the new code is in the live bundle | Deploy job's last step                      |
| Rollback                                                            | A release whose API never answers fails the health check and rolls back by itself     | KAN-37 learning-log entry                   |

## Known gaps

What is not tested, and why.

- **PayNow QR in a real bank app.** The payload's checksum is checked by unit tests and once more with Python's `binascii.crc_hqx`, but nobody has scanned it with a banking app (KAN-61 was dropped on 23 Nov).
- **SMS codes.** The SNS sender is built and unit tested, but a new AWS account on the free plan can't send SMS, so the live site uses the Telegram check instead.
- **Browsers.** The browser tests run WebKit as an iPhone 14, because that is what iPhone users run. Chrome on Android and desktop browsers are only checked by hand.
- **Load.** 10 users for 1 minute from one runner in the US. A bigger test would need a second server to be meaningful.
- **Receipts.** The accuracy test used 5 receipts. Faded, crumpled or handwritten receipts were not tried.
- **Web coverage per folder.** The web gate is for the whole app (99% lines). `src/bills` on its own is at 83% lines; most of it is covered through the page tests.
- **No visual regression tests.** Layout bugs (the white Google button, sheets cut off at the bottom) were found by looking, not by a test.

## How to run the tests

From the repo root, after `npm ci`:

```bash
npm run test:cov -w apps/api      # API unit tests with the coverage gate
npm run test:e2e -w apps/api      # API e2e tests (needs Postgres, see README)
npm test -w apps/web              # web tests with the coverage gate
npm run qa:report                 # build this report into qa/site (open qa/site/index.html)
```

The browser tests start the real images with Docker Compose; the steps are in [pipeline.md](../docs/pipeline.md#browser-tests-playwright-kan-53). The k6 test is the `k6` workflow in GitHub Actions (Run workflow).
