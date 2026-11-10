# Sprint 2: review and retro

**Sprint goal (M2):** auth, bills, sharing, claims, summary and OCR API deployed to EC2 by the pipeline.

**Closed:** 10 Nov 2026 (planned 15 Nov). All delivery tickets were done in the first 6 days.

## Review

**M2 is met.**

- Every merge to `main` builds the image, pushes it to GHCR and deploys it to EC2: migrations, start, health check, automatic rollback. **Merge → live in about 2½ minutes.** The deploy logs in to AWS with OIDC, so no AWS key is stored anywhere.
- Every PR runs **7 required checks**: `gitleaks`, `lint api`, `lint web`, `test-api` (90% coverage gate), `test-web`, `test-e2e` (real Postgres) and `docker-build`.
- The database is **Amazon RDS** (PostgreSQL 18.3): private, reachable only from the server's security group, TLS with the certificate checked, automated backups.
- Receipts are read by **Gemini 3.5 Flash-Lite** in production (about 2 s, 35/35 items on 5 real receipts) and by a Fake in tests and CI.
- **Checked on the live server on 10 Nov:** `GET /api/health` → `{"status":"ok","db":"up"}`. A new bill with the brief's items gives `subtotal 2950 + service 295 + GST 292 = 3537` from `GET /api/bills/:id/summary`.

### Done

| Ticket | What                                                   | Points |
| ------ | ------------------------------------------------------ | -----: |
| KAN-24 | Register, login, JWT guard                             |      5 |
| KAN-25 | Bill and item CRUD with DTO validation                 |      5 |
| KAN-26 | `BillOwnerGuard`                                       |      2 |
| KAN-27 | Share link, join code, guest join                      |      3 |
| KAN-28 | Guests claim items; owner locks the bill               |      3 |
| KAN-29 | Per-person summary through `SplitService`              |      2 |
| KAN-30 | Error format, logging, request ID, rate limit, headers |      3 |
| KAN-74 | Equal, shares, percent and exact splits per item       |      3 |
| KAN-31 | `OcrService` interface + Fake, chosen by config        |      3 |
| KAN-33 | Gemini receipt reading into a draft                    |      5 |
| KAN-76 | Expenses API, monthly summary in Singapore time        |      3 |
| KAN-34 | API e2e tests against Postgres in CI                   |      3 |
| KAN-35 | AWS account, budget alert, EC2 with Docker             |      2 |
| KAN-36 | Multi-stage non-root image, pushed to GHCR             |      3 |
| KAN-37 | Deploy job: OIDC, migrations, health check, rollback   |      3 |
| KAN-75 | Database moved to Amazon RDS                           |      2 |
| KAN-38 | This review                                            |      1 |

**Numbers:** 51 story points in the sprint, all done. Burndown: remaining work stayed below the guideline the whole sprint and reached 0 on 10 Nov. 25 PRs merged to `main` (4 from Dependabot), 0 open. 323 unit tests and 75 e2e tests, all green.

### Not finished (moved to Sprint 3)

No tickets are left open. Evidence from Sprint 1 is **still** missing and moves again, now as part of KAN-50 (capture evidence):

- KAN-16: CI time with and without the npm cache
- KAN-17: a direct `git push origin main` being rejected
- KAN-19: rounding checked against 3 real receipts

## Retro

### What went well

- **The pipeline now reaches production.** Every merge since KAN-37 deployed by itself; a broken release would have rolled back (tested before the first real deploy).
- **Measured instead of guessed.** Gemini 3.8 Flash took 100 s on one receipt; timing three models moved me to Flash-Lite (about 2 s, 500 free a day). The model is a setting, so each switch was one line.
- **Tested before switching.** The RDS connection was proven from a one-off container and the tables were created on RDS while the live site still used the old database. The real switch was just the merge.
- **Real data found real bugs.** 5 real receipts broke the sums three ways (a discount, "2 FOR" deals, GST-inclusive totals); each became a prompt rule or a check.

### What didn't go well

- **Cloud details I assumed were wrong.** GitHub's OIDC `sub` includes numeric IDs most guides don't show (deploy #7 failed), and the RDS security group first allowed the wrong group (timeouts until CloudShell showed the server's real group).
- **SSH limited to one IP is fragile.** My IP changed with my VPN and again when I was out, which locked me out twice.
- **A secret went where it shouldn't.** The new database password was still on my clipboard and got pasted into a chat. I changed it straight away.
- **Windows again:** Smart App Control blocked oxlint after a clean install (I ran it in a Linux container instead), and Docker Desktop kept closing.
- **The Sprint 1 evidence is still missing.** I said I'd take screenshots as things happen; the three old ones were never done.

### What I'll change in Sprint 3

- When a cloud connection fails, **look up the real setting first** (CloudShell `describe-*`) before changing anything.
- After pasting a secret, **copy something else** so it can't be pasted again by accident.
- Take the three missing screenshots **on the first day** of Sprint 3.
- Start with the riskiest new thing, **HTTPS (KAN-39)**, because the PWA can't be installed on an iPhone without it.

### Was the plan realistic?

Sprint 2 had 51 points and finished in 6 of its 11 days, so the backend estimate was too cautious. Sprint 3 has 52 points in 7 days, and most of it is frontend, which is new to me. Adjustments:

- **KAN-40 (rollback, 3 points) is mostly done already:** `deploy.sh` has rolled back on a failed health check since KAN-37. What is left is evidence of a real rollback in production.
- **Start Sprint 3 early (11 Nov)** with the backend tickets (KAN-77, KAN-78, KAN-79), so the frontend gets the most days.
- If Sprint 3 runs late, cut in this order: WebSocket live updates → discounts → groups → QR polish (all stretch, none in Sprint 3 yet).

## Evidence

| What                             | File                                           |
| -------------------------------- | ---------------------------------------------- |
| Board and burndown at sprint end | `docs/evidence/kan-38-board-burndown.png`      |
| Green CI incl. `test-e2e`        | `docs/evidence/kan-34-test-e2e-green.png`      |
| Seven required checks            | `docs/evidence/kan-36-seven-checks.png`        |
| Deploy run                       | `docs/evidence/kan-37-deploy-run-green.png`    |
| Jira deployment panel            | `docs/evidence/kan-37-jira-deployment.png`     |
| GHCR image tagged with SHA       | `docs/evidence/kan-36-ghcr-sha-tag.png`        |
| Live health from a browser       | `docs/evidence/kan-37-live-health-browser.png` |
