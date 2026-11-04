# SplitLah API

NestJS backend for SplitLah. See the root `README.md` for the project overview.

## Run locally

From the repo root:

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres 18 on localhost:5433
cp apps/api/.env.example apps/api/.env
npm ci                                                 # also runs prisma generate
```

From `apps/api`:

```bash
npx prisma migrate dev   # apply migrations
npx prisma db seed       # demo user + the brief's example bill
npm run start:dev        # http://localhost:3000
```

## Test

From `apps/api`:

```bash
npm test             # unit tests
npm run test:cov     # with coverage; fails below 90% on src/split
```
