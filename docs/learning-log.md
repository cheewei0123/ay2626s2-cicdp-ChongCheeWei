# Learning log

Short notes on what I learned and what went wrong, newest first. Used as evidence for the report.

## KAN-19: SG service charge then GST (TDD)

- **TDD:** wrote 10 tests first against a stub that throws, saw all 10 fail (red), then wrote the code until they passed (green). The two commits are kept separate on the PR so the order is visible.
- **Order matters:** service is charged on the subtotal, then GST on subtotal + service. On the brief's bill (2950) that gives 295 + 292 = 3537. Charging GST on the subtotal alone would give 266 and the wrong total.
- **Rounding with integers only:** `Math.floor((amount * bp + 5000) / 10000)` rounds half up without floats. Adding half of 10000 before dividing is what turns `floor` into "round half up". Example: 3245 × 900 = 2,920,500 → 292.
- **Guard clauses:** negative or decimal inputs throw a `RangeError` so a bad value can never quietly produce a wrong bill.
- Split code coverage: 100% lines and branches.

## KAN-18: Prisma + Postgres in Docker

- Docker Desktop needed the Windows "Virtual Machine Platform" feature. `wsl --install` failed with `Forbidden (403)` because it tries to download Ubuntu; `wsl --install --no-distribution` (or enabling the feature with `dism`) fixed it.
- Port 5432 was already used by a Postgres 18 I had installed on Windows, so the Docker database runs on 5433.
- Prisma 7 is different from older tutorials: it needs `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`), and `migrate dev` no longer generates the client. I added `postinstall: prisma generate` so `npm ci` (and CI) always generates it.
- Local (Docker) and production (Amazon RDS) both use Postgres 18 so behaviour matches (dev/prod parity).

## KAN-17: Protect main

- The ruleset was set up correctly but **not enforced**: GitHub only enforces rulesets on private repos with a paid plan. A direct push to `main` went through. After making the repo public, the same push was rejected with `GH013: Changes must be made through a pull request`.
- Auto-delete of merged branches only applies to PRs merged after the setting is turned on.

## KAN-16: CI workflow

- oxlint reports some rules (e.g. `no-debugger`) as **warnings**, which exit 0, so a PR with lint problems would still be green. Found this by adding a `debugger;` on purpose. Fixed with `oxlint --deny-warnings`.
- A PR follows its branch: pushing a fix to the same branch updates the open PR and re-runs CI.

## KAN-15: Monorepo

- Nest CLI v12 and the current Vite template set up **oxlint and Vitest** instead of ESLint and Jest. I kept the generated tools.
- `README.md` had been saved as UTF-16, so git treated it as a binary file. Converted it to UTF-8; VS Code kept showing it garbled until the tab was reopened.
- Squash merge uses the PR title as the commit message, so the PR title must start with the Jira key.
