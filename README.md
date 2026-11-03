# SplitLah 🧾

> Snap a receipt, share a link, and everyone pays exactly their share via PayNow — with service charge and GST split fairly to the cent.

[![CI](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/ci.yml/badge.svg)](https://github.com/cheewei0123/ay2626s2-cicdp-ChongCheeWei/actions/workflows/ci.yml)
![Deploy](https://img.shields.io/badge/deploy-coming%20soon-lightgrey)

**Live app:** _coming soon_ · **Jira board:** _link_ · **Module:** ST0529 CI/CD (CA1)

---

## The problem

Splitting a restaurant bill in Singapore is awkward:

- Splitting equally is unfair when people order different things
- Typing every item into an app is slow
- Bills add **10% service charge, then 9% GST on top**, and most apps don't handle this properly
- People pay each other back with **PayNow**, not Venmo or PayPal

## What SplitLah does

- 📸 **AI receipt scanning:** take a photo; the items, prices, service charge and GST are filled in automatically
- 🔗 **Invite by link or QR:** friends join with just a name, no sign-up needed
- ✋ **Claim your items:** tap what you ate; shared items split equally by default, adjustable by %, shares or exact amount
- 🧮 **Fair to the cent:** integer-cent maths with largest-remainder rounding, so everyone's shares add up to the receipt total
- 💸 **PayNow QR:** each friend gets a QR for their exact amount, plus tap-to-copy number and amount
- 📊 **Personal expenses:** your share is logged to your monthly expense history automatically, with AI categorisation and manual entry
- 📱 **Installable PWA:** add it to your iPhone home screen, no App Store needed

## Tech stack

| Layer    | Technology                                           |
| -------- | ---------------------------------------------------- |
| Backend  | NestJS (TypeScript), Prisma ORM                      |
| Database | PostgreSQL (Amazon RDS in production)                |
| Frontend | React + Vite + Tailwind CSS (PWA)                    |
| AI       | Google Gemini (receipt reading + categorisation)     |
| CI/CD    | GitHub Actions → GitHub Container Registry → AWS EC2 |
| Hosting  | Docker Compose + Caddy (HTTPS) on EC2                |
| Security | Gitleaks, Dependabot, CodeQL, Trivy, npm audit       |

## Repository structure

```
splitlah/
├── apps/
│   ├── api/        # NestJS backend
│   └── web/        # React PWA frontend
├── infra/          # Docker Compose, Caddyfile, deploy scripts
├── docs/           # Architecture, API, data model, ADRs, evidence
└── .github/        # CI/CD workflows, PR template, Dependabot
```

## Getting started

> 🚧 Setup instructions will be added once the monorepo is in place (KAN-15).

```bash
git clone https://github.com/<your-username>/splitlah.git
cd splitlah
npm ci
```

## CI/CD pipeline

> 🚧 Pipeline details will be added in KAN-16 / KAN-37. See `docs/pipeline.md`.

**On every pull request:** lint → unit tests + coverage → API e2e → security scans → Docker build
**On merge to `main`:** push image → deploy to EC2 → DB migration → health check → auto-rollback on failure

## Contributing conventions

- **Branches:** `feature/KAN-<n>-short-name`, `fix/…`, `ci/…`, `docs/…`, `chore/…`
- **Commits:** `KAN-<n> <type>(<scope>): <summary>`
  e.g. `KAN-19 feat(split): add GST calculation`
- **PRs:** title starts with the Jira key; squash-merge only; all checks must pass

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## Project status

| Milestone               | Target | Status         |
| ----------------------- | ------ | -------------- |
| M1: CI + split engine   | 8 Nov  | 🟡 In progress |
| M2: API deployed to AWS | 15 Nov | ⚪ Not started |
| M3: PWA live on iPhone  | 22 Nov | ⚪ Not started |
| M4: Feature freeze      | 24 Nov | ⚪ Not started |
| M5: Report submitted    | 26 Nov | ⚪ Not started |

---

_Built by Chee as a Singapore Polytechnic ST0529 CI/CD project._
