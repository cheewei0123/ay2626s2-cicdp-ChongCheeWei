# SplitLah 🧾

> Snap a receipt, share a link, and everyone pays exactly their share by PayNow, with service charge and GST split fairly to the cent.

[![CI](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/ci.yml/badge.svg)](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/ci.yml)
[![Deploy](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/deploy.yml/badge.svg)](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/deploy.yml)
[![CodeQL](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/codeql.yml/badge.svg)](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/codeql.yml)

**Live app:** [splitlah.duckdns.org](https://splitlah.duckdns.org) · **Jira board:** [KAN](https://cheewei0123.atlassian.net/jira/software/projects/KAN/boards) · **Module:** ST0529 CI/CD (CA1)

<p>
  <img src="docs/evidence/kan-46-iphone-standalone.png" alt="SplitLah opened from the iPhone home screen" width="240">
  <img src="docs/evidence/kan-46-iphone-home-screen.png" alt="SplitLah icon on the iPhone home screen" width="240">
</p>

## The problem

Splitting a restaurant bill in Singapore is awkward:

- Splitting equally is unfair when people order different things
- Typing every item into an app is slow
- Bills add **10% service charge, then 9% GST on top**, and most apps don't handle this properly
- People pay each other back with **PayNow**, not Venmo or PayPal

## What SplitLah does

- 📸 **AI receipt scanning:** take a photo or pick one from Photos; Gemini fills in the items and prices, service charge and GST are ticked only when the printed total needs them, and you check everything against that total. A photo that isn't a receipt gets "No receipt found", and each account can scan 20 receipts a day
- 👆 **Swipe your bills:** swipe right to pin a bill to the top, left to share or delete it (with Undo); press and hold for a menu, and search once the list grows
- 🔗 **Invite by link, QR or a 5-character code:** friends join with just a name, no sign-up
- ✋ **Claim your items:** tap what you had; a shared item splits equally, or by %, shares or exact amounts
- 🧮 **Fair to the cent:** integer-cent maths with largest-remainder rounding, so the shares always add up to the receipt total
- 💸 **PayNow QR:** each friend gets a QR for their exact amount; the owner ticks who has paid. The owner's PayNow number is checked first, by a Telegram bot
- 📊 **Personal expenses:** your share is logged to your expenses when the bill is locked; add your own by hand or by photo, with the category guessed and your corrections remembered; see any date range as bars, a pie or over time
- ✉️ **Email verification:** a one-time link before you can start bills or log expenses
- 🔐 **Account safety:** forgot, reset and change password (other devices are logged out), two-step login with an authenticator app and backup codes, Continue with Google, 14-day logins that logout really ends, and deleting your account (closed at once, wiped after 6 months)
- 📱 **Installable PWA:** add it to the iPhone home screen, no App Store needed

## Architecture

```mermaid
flowchart LR
  U[iPhone PWA<br/>React]
  subgraph EC2["EC2 (Docker Compose)"]
    C[Web container<br/>Caddy: HTTPS + React files]
    A[NestJS API]
  end
  DB[(PostgreSQL<br/>Amazon RDS)]
  G[Gemini<br/>receipt OCR]
  E[Gmail SMTP<br/>emails]
  T[Telegram bot<br/>PayNow number check]
  GO[Google<br/>sign-in]

  U -->|HTTPS| C
  C -->|/api| A
  A --> DB
  A --> G
  A --> E
  A <-->|webhook| T
  U -.->|Continue with Google| GO
  A -->|check ID token| GO
```

Caddy serves the React app, adds the security headers (CSP, HSTS) and passes `/api/*` to the API; only Caddy faces the internet. Receipt reading, email and text messages sit behind interfaces (`OCR_SERVICE`, `EMAIL_SERVICE`, `SMS_SERVICE`), so tests and CI use fakes and never call Gemini, send email or text anyone. More in [docs/architecture.md](docs/architecture.md).

## Tech stack

| Layer      | Technology                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend    | NestJS 12 (TypeScript), Prisma 7                                                                                                                                                     |
| Database   | PostgreSQL 18 (Docker locally, Amazon RDS in production)                                                                                                                             |
| Frontend   | React 19, Vite 8, Tailwind CSS 4, PWA (vite-plugin-pwa)                                                                                                                              |
| AI / email | Google Gemini (receipt reading), Gmail SMTP with nodemailer (verify and reset)                                                                                                       |
| Accounts   | scrypt passwords, server-side sessions, TOTP two-step login (RFC 6238, `node:crypto`), Google sign-in (`google-auth-library`), Telegram bot for PayNow numbers                       |
| Testing    | Vitest, Supertest, Testing Library, fast-check, Playwright (WebKit, iPhone 14)                                                                                                       |
| CI/CD      | GitHub Actions → GitHub Container Registry → AWS EC2 over SSH, AWS OIDC                                                                                                              |
| Hosting    | Docker Compose + Caddy (automatic HTTPS) on EC2, `splitlah.duckdns.org`                                                                                                              |
| Security   | Gitleaks, Dependabot, CodeQL, Trivy, npm audit (audit-ci); CSP and security headers in Caddy; rate limits per route (OWASP Top 10 checklist in [docs/security.md](docs/security.md)) |

## Run it locally

**You need:** Node.js 24 (the version is in [`.nvmrc`](.nvmrc)), npm, Docker Desktop and Git.

```bash
git clone https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei.git
cd ay2626s2-cicdp-ChongCheeWei
npm ci                                                  # both apps; also runs prisma generate
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres 18 on localhost:5433
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and set `JWT_SECRET` to any long random string, for example the output of:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Then create the tables, add the demo bill and start both apps (two terminals):

```bash
cd apps/api
npx prisma migrate deploy   # apply every migration
npx prisma db seed          # the brief's example bill (join code SEED2)
npm run start:dev           # API on http://localhost:3000
```

```bash
npm run dev -w apps/web     # from the repo root: the app on http://localhost:5173
```

Open <http://localhost:5173> and **Register**. With the default `EMAIL_PROVIDER=fake`, nothing is emailed: the verify link is printed in the API terminal (`(fake) to you@…: … /verify?token=…`). Open it to verify, then start a bill. With `OCR_PROVIDER=fake`, any photo "reads" as the brief's receipt ($35.37). To try the guest side, open **Have a code? Join a bill** and enter `SEED2`.

### Environment variables (`apps/api/.env`)

| Name                                                                     | What it's for                                                                                                      | Example / default                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `PORT`                                                                   | Port the API listens on                                                                                            | `3000`                                                   |
| `DATABASE_URL`                                                           | PostgreSQL connection                                                                                              | `postgresql://splitlah:splitlah@localhost:5433/splitlah` |
| `WEB_ORIGIN`                                                             | The only browser origin allowed to call the API (CORS)                                                             | `http://localhost:5173`                                  |
| `JWT_SECRET`                                                             | Signs login and guest tokens; 32+ random characters                                                                | _(generate one)_                                         |
| `OCR_PROVIDER`                                                           | Receipt reader: `fake` or `gemini`                                                                                 | `fake`                                                   |
| `GEMINI_API_KEY`                                                         | Only with `gemini`; free key from Google AI Studio                                                                 | _(empty)_                                                |
| `GEMINI_MODEL`                                                           | Gemini model name                                                                                                  | `gemini-3.5-flash-lite`                                  |
| `AI_DAILY_LIMIT`                                                         | Most receipt scans one account can make per Singapore day                                                          | `20`                                                     |
| `EMAIL_PROVIDER`                                                         | Verify and reset emails: `fake` (logged) or `smtp`                                                                 | `fake`                                                   |
| `SMTP_USER`, `SMTP_PASS`                                                 | Only with `smtp`: Gmail address and a Google **app password**                                                      | _(empty)_                                                |
| `APP_URL`                                                                | Where the links in emails point                                                                                    | `http://localhost:5173`                                  |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`                                   | Optional SMTP overrides                                                                                            | `smtp.gmail.com`, `465`                                  |
| `SMS_PROVIDER`, `AWS_REGION`                                             | Texts for the PayNow number check: `fake` or `sns` (built, off on the live site: the free AWS plan can't send SMS) | `fake`, `ap-southeast-1`                                 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | The Telegram bot that checks PayNow numbers; leave all empty to turn it off                                        | _(empty)_                                                |
| `GOOGLE_CLIENT_ID`                                                       | Continue with Google; public, not a secret; empty hides the button                                                 | _(empty)_                                                |

Real values live only in the server's `/opt/splitlah/.env` and in GitHub Secrets, never in git. See [docs/pipeline.md](docs/pipeline.md#secrets).

## Scripts

From the repo root:

| Command                                   | What it does                                                   |
| ----------------------------------------- | -------------------------------------------------------------- |
| `npm run lint`                            | oxlint on both apps, warnings fail                             |
| `npm run typecheck`                       | TypeScript check on both apps                                  |
| `npm run format:check` / `npm run format` | Prettier check / fix                                           |
| `npm test`                                | Unit and component tests for both apps                         |
| `npm run build`                           | Builds both apps                                               |
| `npm run test:cov -w apps/api`            | API unit tests with the 90% coverage gate                      |
| `npm run test:e2e -w apps/api`            | API end-to-end tests against the local Postgres                |
| `npm test -w apps/web`                    | Web component tests with the 90% coverage gate                 |
| `npm run test:browser -w apps/web`        | Playwright browser tests (start the Docker stack first, below) |
| `npm run qa:report`                       | Builds the QA report from the last test run into `qa/site`     |

The browser tests run against the real images in Docker. How to start them is in [docs/pipeline.md](docs/pipeline.md#browser-tests-playwright-kan-53).

## CI/CD pipeline

**On every pull request**, 13 required checks run in parallel (about 4 minutes): Gitleaks, lint + format + typecheck + build for each app, API and web unit tests with 90% coverage gates, API end-to-end tests against Postgres 18, Playwright browser tests as an iPhone 14, the Docker builds, npm audit, Trivy image scans and CodeQL. `main` is protected: nothing merges until every check is green, and there is no bypass.

**On merge to `main`**: build and push the images to GHCR (tagged with the commit SHA) → SSH to EC2 using AWS OIDC (no stored AWS keys) → `prisma migrate deploy` on RDS → start → health check → automatic rollback to the previous image if it fails. Merge to live takes about 2½ minutes.

**QA report:** after the tests, CI builds a report from the results and the `lcov.info` coverage files; on `main` it is published to GitHub Pages: **[cheewei0123.github.io/ay2626s2-cicdp-ChongCheeWei](https://cheewei0123.github.io/ay2626s2-cicdp-ChongCheeWei/)** (test counts, coverage per folder against the gates, line-by-line coverage, the browser-test report). See [qa/](qa/).

**By hand:** a k6 load test against the live site (`k6.yml`, 10 users for 1 minute, with latency and error thresholds).

Details: [docs/pipeline.md](docs/pipeline.md) · security: [docs/security.md](docs/security.md) · infrastructure: [docs/infra.md](docs/infra.md)

## Project management and conventions

Work is planned in [Jira (KAN)](https://cheewei0123.atlassian.net/jira/software/projects/KAN/boards) in sprints; every branch, commit and PR carries the Jira key, so it shows on the ticket.

- **Branches:** `feature/KAN-<n>-short-name`, `fix/…`, `test/…`, `ci/…`, `docs/…`, `chore/…`
- **Commits:** `KAN-<n> <type>(<scope>): <summary>`, e.g. `KAN-19 feat(split): add GST calculation`
- **PRs:** title starts with the Jira key; uses the PR template; squash-merge only

See [CONTRIBUTING.md](CONTRIBUTING.md) for the details, and [docs/sprints/](docs/sprints/) for the sprint reviews.

## Documentation

| Doc                                  | What's in it                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [Diagrams](docs/diagrams/)           | Mermaid sources for every diagram                                                                                |
| [Architecture](docs/architecture.md) | Containers, NestJS modules, one request step by step                                                             |
| [API](docs/api.md)                   | Every endpoint, who can call it, errors                                                                          |
| [Data model](docs/data-model.md)     | Tables, relations, money as integer cents                                                                        |
| [ADRs](docs/adr/)                    | Why NestJS, integer cents, OCR and email interfaces                                                              |
| [User flows](docs/user-flows.md)     | Owner and guest journeys                                                                                         |
| [UI design](docs/ui-design.md)       | Colours, glass components, layout rules                                                                          |
| [Pipeline](docs/pipeline.md)         | Every CI job, the deploy, secrets, browser tests                                                                 |
| [Security](docs/security.md)         | Scans, findings and accepted risks                                                                               |
| [Infrastructure](docs/infra.md)      | EC2, RDS, Caddy, OIDC setup                                                                                      |
| [Evaluation](docs/evaluation.md)     | Strengths, limits, bottlenecks, trade-offs, next steps                                                           |
| [QA report](qa/qa-report.md)         | Test strategy, results, defects found, gaps ([live](https://cheewei0123.github.io/ay2626s2-cicdp-ChongCheeWei/)) |
| [Learning log](docs/learning-log.md) | What I learned and what went wrong, per ticket                                                                   |
| [Evidence](docs/evidence/)           | Screenshots used in the report                                                                                   |

## Repository structure

```
├── apps/
│   ├── api/        # NestJS API, Prisma schema and migrations, unit + e2e tests
│   └── web/        # React PWA, component tests, Playwright tests (e2e/)
├── infra/          # Docker Compose files (dev, CI, production), deploy and server scripts
├── docs/           # Architecture, API, data model, ADRs, sprints, evidence
├── qa/             # QA report and its generator, k6 load test, receipt accuracy, saved results
└── .github/        # Workflows (CI, CodeQL, deploy, k6 load test), PR template, Dependabot
```

## Project status

| Milestone                         | Target | Status                    |
| --------------------------------- | ------ | ------------------------- |
| M1: CI + split engine             | 8 Nov  | ✅ Met                    |
| M2: API deployed to AWS           | 15 Nov | ✅ Met                    |
| M3: PWA live on iPhone over HTTPS | 22 Nov | ✅ Met                    |
| M4: Feature freeze                | 24 Nov | ✅ Met (only fixes since) |
| M5: Report submitted              | 27 Nov | 🟡 In progress            |

---

_Built by Chee as a Singapore Polytechnic ST0529 CI/CD project._
