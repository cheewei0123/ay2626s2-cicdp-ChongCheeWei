# The web image: the React app's built files, served by Caddy with HTTPS.
# Build it from the repo root (the npm workspace lockfile lives there):
#   docker build -f apps/web/Dockerfile -t splitlah-web .

# ---- 1. build: compile the React app into static files (HTML, JS, CSS) ----
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web
COPY apps/web apps/web
RUN npm run build -w apps/web

# ---- 2. runtime: Caddy only, no Node.js, no source code ----
FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
# Never run as root (same as the API image). The caddy binary is already allowed to use
# ports 80 and 443 without root; it only needs to own /data (certificates) and /config.
RUN addgroup -S caddy && adduser -S -G caddy caddy \
  && chown -R caddy:caddy /data /config
USER caddy
# Caddy's own command (from the base image) starts the server with /etc/caddy/Caddyfile
