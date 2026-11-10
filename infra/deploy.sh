#!/usr/bin/env bash
# Deploys one release on the server. Run by the deploy job over SSH, as the deploy user:
#   cd /opt/splitlah && bash deploy.sh <commit SHA>
# Safe to re-run with the same SHA: every step leaves the server in the same state.

set -euo pipefail

NEW_TAG="${1:?Usage: deploy.sh <commit SHA>}"
cd /opt/splitlah
STATE_FILE=.deployed-tag # remembers the last release that passed its health check
PREVIOUS_TAG="$(cat "$STATE_FILE" 2>/dev/null || true)"

# Waits up to 60 s for GET /api/health to answer 200 (the API needs a few seconds to start).
# Asks the API inside its container, so a slow certificate from Let's Encrypt can't fail
# the check; the deploy job checks https:// from the internet afterwards.
healthy() {
  for _ in $(seq 1 12); do
    if docker compose exec -T api node -e       "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"       >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

echo "== Deploying $NEW_TAG (previous: ${PREVIOUS_TAG:-none})"
export TAG="$NEW_TAG"

echo "== 1. Pull the new images from GHCR"
docker compose pull web api migrate

echo "== 2. Apply database migrations (additive only, so the old version still works if we roll back)"
docker compose run --rm migrate

echo "== 3. Start the new API and web server"
docker compose up -d --remove-orphans

echo "== 4. Health check"
if healthy; then
  echo "$NEW_TAG" > "$STATE_FILE"
  echo "== Healthy. $NEW_TAG is live."
  docker image prune -f >/dev/null # remove old, unused images so the disk doesn't fill up
  exit 0
fi

echo "== Health check FAILED for $NEW_TAG" >&2
docker compose logs --tail 50 api >&2 || true
if [[ -n "$PREVIOUS_TAG" ]]; then
  echo "== Rolling back to $PREVIOUS_TAG" >&2
  export TAG="$PREVIOUS_TAG"
  docker compose up -d --remove-orphans
  if healthy; then
    echo "== Rolled back: $PREVIOUS_TAG is live again." >&2
  else
    echo "== Rollback is unhealthy too. Check the server by hand." >&2
  fi
else
  echo "== No earlier release to roll back to." >&2
fi
exit 1 # the deploy job fails, so the broken release is visible in GitHub
