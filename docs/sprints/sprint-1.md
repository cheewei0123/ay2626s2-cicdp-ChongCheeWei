# Sprint 1: review and retro

**Sprint goal (M1):** CI runs lint and tests on every PR, and the split engine is correct to the cent with at least 80% coverage.

**Closed:** 5 Nov 2026 (planned 8 Nov; every other ticket was done early).

## Review

**M1 is met.**

- Every PR runs 5 required checks: `gitleaks`, `lint api`, `lint web`, `test-api`, `test-web`. A PR cannot merge until all pass. A typical run takes under 1 minute.
- The split engine gives the brief's answer exactly: Chee 720, Ali 899, Ben 959, Dan 959 = 3537.
- Coverage on `src/split` is **100%** lines and branches; CI fails below 90%.

### Done

| Ticket | What                                          |
| ------ | --------------------------------------------- |
| KAN-11 | Jira board, sprint, GitHub for Jira link      |
| KAN-12 | Questions for the lecturer                    |
| KAN-13 | NestJS building blocks (learning log)         |
| KAN-14 | Learning log, report notes, evidence folder   |
| KAN-15 | Monorepo: NestJS API + React web              |
| KAN-16 | CI workflow on every PR                       |
| KAN-17 | Protected `main` + PR template                |
| KAN-18 | Prisma + Postgres in Docker, seed data        |
| KAN-19 | Service charge then GST, integer cents (TDD)  |
| KAN-20 | Per-person split with largest remainder (TDD) |
| KAN-21 | Edge-case and property tests, coverage gate   |
| KAN-22 | Gitleaks + Dependabot                         |
| KAN-68 | Git conventions + pipeline design             |
| KAN-69 | Architecture + ADRs                           |
| KAN-70 | Data model (ER diagram)                       |
| KAN-71 | REST API contract                             |
| KAN-72 | User flows + wireframes                       |

**Numbers:** 25 PRs merged to `main` (4 of them from Dependabot), 0 open. Burndown: 37 of 38 story points done before KAN-23, with remaining work below the guideline the whole sprint.

### Not finished (moved to Sprint 2)

No tickets are left open. Some evidence for finished tickets is still missing, so it moves to Sprint 2:

- KAN-16: screenshot of a PR going red on a lint error, and CI time with and without the npm cache
- KAN-17: screenshot of a direct `git push origin main` being rejected
- KAN-19: rounding checked against 3 real receipts

## Retro

### What went well

- **Tests found a real bug.** The property test (1,000 random bills) found an overflow on large bills that my own stress test missed. Fixed with `BigInt`.
- **CI blocked bad changes.** A Dependabot PR with mismatched vitest versions went red and never reached `main`. Gitleaks and GitHub push protection both blocked fake keys.
- **Small PRs, one ticket each.** Every PR has the Jira key, so the work shows on each Jira item.

### What didn't go well

- **Windows setup cost time:** a UTF-16 README, WSL install blocked (`403`), and port 5432 already used by a local Postgres.
- **Assumed instead of checked:** the ruleset looked set up but was not enforced (private repo, free plan); a dependency change passed on my laptop but failed in CI's clean install.
- **Evidence not saved as I went:** screenshots sat in my Pictures folder until I sorted them later, and a few were never taken.

### What I'll change in Sprint 2

- Run `npm ci` (clean install) before pushing any dependency change.
- Take each screenshot when the thing happens and save it straight into `docs/evidence/` with its ticket name.
- Check the PR title before **Squash and merge**, because it becomes the commit message on `main`.

## Evidence

| What                | File                                         |
| ------------------- | -------------------------------------------- |
| Board at sprint end | `docs/evidence/kan-23-board.png`             |
| Burndown chart      | `docs/evidence/kan-23-burndown.png`          |
| Green pipeline run  | `docs/evidence/kan-22-five-checks-green.png` |
| Coverage report     | `docs/evidence/kan-21-green-coverage.png`    |
