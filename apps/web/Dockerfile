# The web image: the React app's built files, served by Caddy with HTTPS.
# Build it from the repo root (the npm workspace lockfile lives there):
#   docker build -f apps/web/Dockerfile -t splitlah-web .

# ---- 1. build: compile the React app into static files (HTML, JS, CSS) ----
FROM node:25-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web
COPY apps/web apps/web
RUN npm run build -w apps/web

# ---- 2. caddy: the same Caddy release, rebuilt with patched Go libraries ----
# Trivy (KAN-41) found HIGH CVEs inside the official Caddy v2.11.9 binary: Go's standard
# library 1.27.3 (fixed in 1.27.4) and golang.org/x/net v0.60.0 (fixed in v0.62.0). No Caddy
# release has both fixes yet, so xcaddy compiles v2.11.9 with Go 1.27.4 and x/net v0.62.0.
# Remove this stage once an official Caddy release includes them.
FROM caddy:2-builder-alpine AS caddy
ARG CADDY_VERSION=v2.11.9
RUN xcaddy build "$CADDY_VERSION" --output /usr/bin/caddy \
  --replace golang.org/x/net=golang.org/x/net@v0.62.0

# ---- 3. runtime: Caddy only, no Node.js, no source code ----
FROM caddy:2-alpine
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
# Never run as root (same as the API image). setcap lets the caddy binary use ports 80
# and 443 without root (the copied binary loses the official image's setting, so it is
# set again); caddy only needs to own /data (certificates) and /config.
RUN setcap cap_net_bind_service=+ep /usr/bin/caddy \
  && addgroup -S caddy && adduser -S -G caddy caddy \
  && chown -R caddy:caddy /data /config
USER caddy
# Caddy's own command (from the base image) starts the server with /etc/caddy/Caddyfile
