# Sprint 3: review and retro

**Sprint goal (M3):** the PWA is installable on an iPhone over HTTPS, PayNow QR works, and the pipeline has rollback and security scans.

**Closed:** 22 Nov 2026, as planned. 3 tickets are not finished and move to Sprint 4 (below).

## Review

**M3 is met, with one check still to do on a second phone.**

- **HTTPS and the PWA:** the app is served at `https://splitlah.duckdns.org` by Caddy with a Let's Encrypt certificate that survives a restart. It installs on the iPhone home screen with its own icon and opens full-screen, with no Safari address bar.
- **The whole journey works in the browser:** scan a receipt (Gemini), fix an item, share a link or a 5-character code, friends join and tap their items, the live summary, lock, a PayNow QR for each friend's exact amount, and the owner ticks who has paid. On every PR, the Playwright test in CI runs the first half (register, verify, scan, fix an item, share, a guest joins and claims, totals match) on an iPhone 14-sized WebKit browser; locking, PayNow and marking paid are covered by the API e2e and component tests.
- **Not yet checked by hand:** the same journey with a friend scanning the QR in a real banking app on their own phone. It was planned for the demo rehearsal (KAN-61), which was dropped on 23 Nov because the brief does not ask for it, so it stays unchecked.
- **Pipeline:** every PR now runs **13 required checks** in parallel (lint, unit tests with 90% coverage gates, API e2e against Postgres, browser e2e, Docker build, Gitleaks, npm audit, CodeQL on the code and the workflows, Trivy on both images). A merge goes live in about **2½–3 minutes**; a failed health check rolls back to the last good release.
- **Security scans:** Trivy found 8 HIGH findings in the first images and CodeQL 3 in the code; all were fixed. One dependency advisory (`effect` inside the Prisma CLI) is accepted until 31 Dec 2026, and one CodeQL alert was reviewed as a false positive. Details in [security.md](../security.md).
- **More than planned:** personal expenses (my share is logged when a bill is locked, manual add, receipt scan, category bars), category guessing that remembers corrections (KAN-78) and email verification (KAN-77), which the 17 Nov plan had cut, were built on the last day.

### Done

| Ticket | What                                                                    | Points |
| ------ | ----------------------------------------------------------------------- | -----: |
| KAN-39 | HTTPS with Caddy on DuckDNS; production compose                         |      3 |
| KAN-40 | Health check and rollback; old images removed so the disk can't fill up |      3 |
| KAN-41 | CodeQL, npm audit and Trivy as required checks                          |      2 |
| KAN-42 | Login and register screens                                              |      2 |
| KAN-43 | New bill, scan receipt and check items screens                          |      5 |
| KAN-44 | Share screen; friends join by link or code and tap their items          |      5 |
| KAN-45 | Summary screen with per-person totals and the lock button               |      2 |
| KAN-46 | PWA: installable on the iPhone home screen                              |      2 |
| KAN-47 | PayNow QR payload with a CRC check                                      |      3 |
| KAN-48 | Each friend sees a PayNow QR for their exact amount                     |      2 |
| KAN-49 | Owner ticks who has paid; the bill is settled                           |      2 |
| KAN-78 | Category guessed from the merchant; corrections remembered              |      3 |
| KAN-79 | Each person's share logged as an expense when the bill is locked        |      2 |
| KAN-81 | PayNow number on a Profile page (slimmed)                               |      3 |
| KAN-51 | Diagrams redrawn to match the code                                      |      3 |
| KAN-52 | This review                                                             |      1 |

**Numbers:** 52 story points in the sprint, 43 done. 33 PRs merged to `main` from 10 to 22 Nov (4 from Dependabot), 0 open. 404 API unit tests (97.91% lines, 95.02% branches), 78 API e2e tests, 168 web tests and 2 browser journeys, all green.

### Not finished (moved to Sprint 4)

| Ticket | What is left                                                                                                                                                 | Points |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----: |
| KAN-77 | Code merged and live. Left: put the SMTP app password in the server's `.env` and take a screenshot of a real email arriving. Only I can create the password. |      3 |
| KAN-80 | Screens merged and live. Left: add an expense and scan a personal receipt on the iPhone, and take the screenshots.                                           |      5 |
| KAN-50 | Evidence merged (coverage, blocked merges, scans). Left: dismiss CodeQL alert #5 as a false positive in the Security tab, then a screenshot of the tab.      |      1 |

All three are checks and evidence, not code, so they fit the feature freeze.

## Retro

### What went well

- **Sprint 2's lessons were used.** HTTPS (the riskiest new thing) was done on day 1, and two of the three missing Sprint 1 screenshots (the rejected push, the npm cache) were taken the same day.
- **A failed deploy left the site up.** On 16 Nov three deploys failed with a full disk while pulling images. `deploy.sh` stopped before touching the running containers, so the site stayed up, and the fix (remove old releases' images) went out as a normal PR.
- **The scanners paid off straight away.** Trivy found a CVE in Caddy that no Caddy release had fixed yet; rebuilding the same Caddy version with a newer Go fixed it instead of accepting it.
- **Measuring found a regression.** Writing the report, I checked the deploy times instead of copying the old "2½ minutes": the median had grown to 7 min 24 s because the three image builds overwrote one shared cache. One cache scope per image brought it back to 2 min 29 s.

### What didn't go well

- **The plan slipped by 2–3 days.** Nothing was merged between 11 and 15 Nov, and on 20 Nov the C: drive had only 1.8 GB free, which crashed Docker and the work session. Most of the frontend landed in the last three days.
- **Too much was merged on the last day.** 18 PRs on 22 Nov. Each passed all 13 checks, but there was no time to try each feature on the phone before the next one, which is why KAN-77 and KAN-80 are not Done.
- **Diagrams and numbers went stale.** The ER diagram still showed tables from the Sprint 1 plan, the pipeline diagram drew parallel checks as a chain, and the deploy time in my notes was a week old.

### What I'll change in Sprint 4

- **Feature freeze on 24 Nov is final:** no new features after it, only fixes, evidence and the report.
- **Check on the phone the same day** a feature is merged, before starting the next one.
- **Keep 10 GB free on C:** (Docker build cache, old images) before running the e2e or Docker builds.
- **Measure, don't remember:** every number in the report comes from a run, a file in `docs/evidence/` or the GitHub API.

### Scope for Sprint 4 (final)

No new features. Sprint 4 is:

| Ticket                 | What                                                          |
| ---------------------- | ------------------------------------------------------------- |
| KAN-50, KAN-77, KAN-80 | Finish the checks and screenshots above                       |
| KAN-54                 | README: a classmate follows the setup from a clean clone      |
| KAN-59                 | Report d): critical analysis and conclusion                   |
| KAN-60                 | Gantt chart and burndown screenshots                          |
| KAN-61                 | Demo rehearsal (dropped 23 Nov: not asked for in the brief)   |
| KAN-62                 | Declaration, report PDF and ZIP, submitted before 27 Nov 5 pm |

**Cut, and listed as future enhancements in the report:** uploading and decoding a PayNow QR image, the phone field and verified-email badge on the profile, one colour per category in the chart, live updates over WebSockets, discounts, and groups or friends lists.

## Evidence

| What                                  | File                                                 |
| ------------------------------------- | ---------------------------------------------------- |
| iPhone over HTTPS                     | `docs/evidence/kan-39-iphone-https.png`              |
| Installed on the home screen          | `docs/evidence/kan-46-iphone-home-screen.png`        |
| Opened full-screen                    | `docs/evidence/kan-46-iphone-standalone.png`         |
| Failed deploy, site left up           | `docs/evidence/kan-40-deploy-disk-full-steps.png`    |
| Deploy times before and after the fix | `docs/evidence/kan-58-deploy-times-before-after.png` |
| API coverage on `main`                | `docs/evidence/kan-50-api-coverage-2026-11-22.txt`   |
| Pipeline diagram                      | `docs/evidence/kan-51-pipeline-diagram.png`          |
| k6 load test                          | `docs/evidence/k6-2026-11-22.txt`                    |
| Timeline of all sprints (Gantt)       | `docs/evidence/kan-60-gantt.png`                     |
| Burndown at sprint end                | `docs/evidence/kan-60-sprint-3-burndown.png`         |
| Verification email on the live site   | `docs/evidence/kan-77-verification-email.png`        |
| Expenses on the iPhone                | `docs/evidence/kan-80-month-view.png`                |
| CodeQL alert #5 dismissed             | `docs/evidence/kan-50-codeql-alert-dismissed.png`    |
