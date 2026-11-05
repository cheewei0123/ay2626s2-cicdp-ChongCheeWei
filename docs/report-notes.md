# Report notes

Bullet points collected as the project goes, grouped by the report rubric. Screenshots are in `docs/evidence/`; the story behind each problem is in `docs/learning-log.md`.

## a) Introduction (10%)

- **Problem:** splitting a Singapore restaurant bill is awkward. People order different things, and bills add 10% service charge, then 9% GST on top. People pay back with PayNow.
- **SplitLah:** scan a receipt, share a link, friends tap their items, everyone pays exactly their share by PayNow QR, and each share is logged in their monthly expenses.
- **The SG-specific rule:** GST is charged on subtotal + service, not on the subtotal alone. On the brief's bill (2950¢) that gives 295 + 292 = 3537¢; GST on the subtotal alone would give 266¢ and the wrong total.
- **Scope of CA1:** NestJS backend, React PWA, and a full CI/CD pipeline from PR checks to deploy.

## b) Architecture and design (30%)

- **Monorepo** with npm workspaces: `apps/api` (NestJS) and `apps/web` (React + Vite + Tailwind). One lockfile at the root.
- **Data model** (KAN-70): 10 tables, ER diagram in `docs/data-model.md`. Evidence: `kan-70-er-diagram.png`.
  - Money is stored as integer cents; rates as basis points (1000 = 10%). No floats, so no rounding drift.
  - Deleting a bill cascades to its items, participants, claims and payments.
  - Guests are participants without a user account (`userId` is optional).
- **Split engine** (`apps/api/src/split`): pure functions, no database or HTTP, so it is fast and easy to test.
  - `billTotals()` charges service first, then GST, rounding half up with integers only.
  - **Largest remainder:** floor everyone's exact share, then give the leftover cents to the largest fractions. Per-person totals always add up to the receipt total.
  - Worked example: Chee 720, Ali 899, Ben 959, Dan 959 = 3537.
- **Database:** Prisma 7 + PostgreSQL 18. Docker locally, Amazon RDS in production (same version for dev/prod parity).

## c) Implementation and CI/CD (30%)

### Git and Jira

- Every branch, commit and PR includes the Jira key (`KAN-<n>`), so work shows on the Jira item. Evidence: `kan-11-jira-linked-prs.png`.
- Trunk-based: short-lived branches, squash merge to a protected `main`, branches auto-deleted after merge.

### Pipeline (`.github/workflows/ci.yml`)

- Runs on every PR and every push to `main`; a new push cancels the old run.
- 5 jobs in parallel: `gitleaks`, `lint api`, `lint web`, `test-api`, `test-web`. A typical run takes under 1 minute.
- `npm ci` with the npm cache keyed on the lockfile; Node version from `.nvmrc`.
- Lint uses oxlint with `--deny-warnings`, because warnings alone exit 0 and would not fail CI.
- **Coverage gate:** `test-api` fails if `src/split` drops below 90% lines or branches (currently 100%). Evidence: `kan-21-green-coverage.png`.

### Protecting main (KAN-17)

- Ruleset: PR required, all 5 checks required, branch must be up to date, no force push or deletion.
- The ruleset was not enforced on a private repo on the free plan. Making the repo public fixed it. Evidence: `kan-17-ruleset-not-enforced.png`.

### TDD (KAN-19, KAN-20)

- Tests written first against a stub, seen failing (red), then the code was written until they passed (green). Separate commits show the order.
- Evidence: `kan-19-red.png`, `kan-19-green.png`, `kan-20-red.png`, `kan-20-green.png`.

### Property tests (KAN-21)

- fast-check generates 1,000 random bills and checks that the totals add up and nobody pays a negative amount.
- It found a real bug: on a large bill, the numbers grew past what JavaScript can hold exactly. Fixed with `BigInt`, and a regression test keeps it fixed. Evidence: `kan-21-red.png`.

### Security (KAN-22)

- **Gitleaks** scans the full git history on every PR and is a required check. Evidence: `kan-22-gitleaks-blocks-pr.png`.
- **GitHub push protection** blocked a fake AWS key before it reached GitHub. Evidence: `kan-22-push-protection-blocked.png`.
- **Dependabot** opens weekly update PRs, which go through the same pipeline. Packages that must share a version (vitest, prisma) are grouped.

### Onboarding

- New to me: NestJS, GitHub Actions, Docker, Prisma 7.
- Current tools differ from older tutorials: Nest v12 generates oxlint and Vitest (not ESLint and Jest), and Prisma 7 needs `prisma.config.ts` and a driver adapter.

## d) Critical analysis (20%)

- **Tests catch what examples miss:** my own 5,000-bill stress test passed, but the property test found the overflow on larger bills.
- **Green CI is not the whole story:** a Dependabot PR passed CI while installing two copies of vitest. A dependency change passed on my laptop but failed in CI's clean `npm ci`. Lesson: test from a clean install.
- **Tool limits:** GitHub only enforces rulesets on public repos (free plan); Dependabot did not always move grouped packages together; push protection only knows provider key formats, so Gitleaks is still needed.
- **Early mistakes kept in history:** two early commit titles don't follow the convention, and `main` is protected so they stay. The PR title now matters because squash merge uses it as the commit message.
- **Windows setup cost time:** UTF-16 README, WSL install blocked (403), port 5432 already in use by a local Postgres.
