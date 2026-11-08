# CI/CD pipeline

The plan for the whole pipeline, and which parts exist today. The workflow lives in `.github/workflows/ci.yml`.

## Stages

Solid boxes are built. Dashed boxes are planned for later sprints.

```mermaid
flowchart LR
  subgraph PR["On every pull request"]
    direction LR
    A[Install<br/>npm ci + cache] --> B[Lint + format<br/>oxlint, Prettier]
    B --> C[Unit tests + coverage<br/>gate 90% on src/split]
    C --> D[API e2e<br/>Supertest + Postgres]
    D --> E[Security<br/>Gitleaks, CodeQL, npm audit]
    E --> F[Docker build]
    F --> G[Trivy image scan]
    G --> H[Playwright<br/>iPhone preset]
  end

  subgraph MAIN["On merge to main only"]
    direction LR
    I[Push images to GHCR<br/>tags: SHA + latest] --> J[SSH deploy to EC2]
    J --> K[prisma migrate deploy<br/>on RDS]
    K --> L{Health check}
    L -->|pass| M[Live]
    L -->|fail| N[Roll back to<br/>previous image]
  end

  H -.->|merge| I

  classDef planned stroke-dasharray: 5 5
  class F,G,H,I,J,K,L,M,N planned
```

Stage E is partly built: Gitleaks runs today; CodeQL and `npm audit` come later.

## What runs today

All jobs start at the same time, on every PR and every push to `main`. A new push to the same branch cancels the run still in progress.

| Job        | What it does                                                                                                                         | Fails when                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `gitleaks` | Scans the full git history for secrets                                                                                               | A key, token or password is found                                                  |
| `lint api` | `npm ci`, oxlint (`--deny-warnings`), Prettier check, type-check (`tsc --noEmit`, tests included), build                             | Any lint warning, unformatted file, type error or failed build                     |
| `lint web` | Same, for `apps/web`                                                                                                                 | Same                                                                               |
| `test-api` | Vitest with coverage, uploads the coverage report                                                                                    | A test fails or `src/split` / `src/common` / `src/auth` / `src/bills` is below 90% |
| `test-web` | Vitest                                                                                                                               | A test fails                                                                       |
| `test-e2e` | Starts a fresh Postgres 18 service container, `prisma migrate deploy`, then the API e2e tests (Supertest) with a random `JWT_SECRET` | A migration fails, or any e2e test fails                                           |

All 6 are required checks on `main`. A typical run takes about 1 minute.

## Environments

| Environment | Where it runs                                 | Database                                      | OCR and email             |
| ----------- | --------------------------------------------- | --------------------------------------------- | ------------------------- |
| Local       | My laptop, `infra/docker-compose.dev.yml`     | Postgres 18 in Docker, port 5433              | Fake (or real, by `.env`) |
| CI          | GitHub Actions runners                        | Postgres 18 service container, fresh each run | Always Fake               |
| Production  | One EC2 instance, Docker Compose, Caddy HTTPS | Amazon RDS, Postgres 18                       | Gemini, real email        |

## Secrets

None of these are ever committed. `.env` files are gitignored; only `.env.example` files with placeholder values are in git.

| Secret           | Lives in                   | Used for                                     |
| ---------------- | -------------------------- | -------------------------------------------- |
| `EC2_HOST`       | GitHub Secrets             | Address the deploy job connects to           |
| `EC2_USER`       | GitHub Secrets             | SSH user on the server                       |
| `EC2_SSH_KEY`    | GitHub Secrets             | Private key for the SSH deploy               |
| `DATABASE_URL`   | Server `.env`              | API connection to RDS                        |
| `JWT_SECRET`     | Server `.env`              | Signing login tokens                         |
| `GEMINI_API_KEY` | Server `.env`              | Receipt reading                              |
| `OCR_PROVIDER`   | Server `.env`              | Chooses Gemini / Tesseract / Fake            |
| `EMAIL_*`        | Server `.env`              | Sending verification emails                  |
| `GITHUB_TOKEN`   | Provided by GitHub Actions | Pushing images to GHCR, Gitleaks PR comments |

The Jira ticket also listed `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. They are not needed: the deploy uses SSH, and the API reaches RDS through `DATABASE_URL`, so no AWS API keys are stored anywhere.

## Rules

- Migrations are additive only (add columns and tables, never drop in the same release), so a rollback to the previous image still works with the new database.
- Tests and CI always use the Fake OCR and email services, so CI never costs money or sends real emails.
