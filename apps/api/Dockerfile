# Multi-stage build for the SplitLah API. Build it from the repo root (the npm
# workspace lockfile lives there):  docker build -f apps/api/Dockerfile -t splitlah-api .
# Each stage starts clean; only what the last stage copies ends up in the image.

# ---- 1. build: all packages (incl. dev tools), generate the Prisma client, compile ----
FROM node:24-slim AS build
WORKDIR /app
# Package files first: Docker reuses this layer (and the slow npm ci) until they change
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# postinstall runs `prisma generate`, which needs the schema and config
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci -w apps/api
COPY apps/api apps/api
RUN npm run build -w apps/api

# ---- migrate: a separate image that only applies database migrations ----
# Build with --target migrate. It keeps the Prisma CLI, which the slim runtime image leaves out.
# The deploy runs it once per release, before starting the new API.
FROM build AS migrate
WORKDIR /app/apps/api
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- 2. prod-deps: only the packages the running app needs (no TypeScript, tests, CLI) ----
FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --ignore-scripts: skip `prisma generate`; the generated client is already compiled into dist/
# --omit=optional: @prisma/client lists the Prisma CLI and TypeScript as *optional* peer
#   dependencies, so --omit=dev alone keeps them (about 100 MB the app never uses)
RUN npm ci -w apps/api --omit=dev --omit=optional --ignore-scripts

# ---- 3. runtime: the image that actually runs ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
# npm puts a package here when the API needs a different version than the shared one
# at the root (e.g. dotenv 18 here, dotenv 17 at the root for Prisma's tools)
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
# Never run as root: the official image has a "node" user for exactly this
USER node
EXPOSE 3000
# Docker marks the container unhealthy if /api/health stops answering 200
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
