# Evidence

Screenshots used in the report, named `kan-<ticket>-<what>.png`.

| File                                      | Ticket | Shows                                                                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `kan-11-jira-linked-prs.png`              | KAN-11 | Jira Development page listing merged PRs linked by their Jira key                                                              |
| `kan-15-readme-shown-as-binary.png`       | KAN-15 | GitHub showing the UTF-16 `README.md` as a binary (`BIN`) diff                                                                 |
| `kan-15-readme-utf16-garbled.png`         | KAN-15 | VS Code reading the converted UTF-8 README with the old UTF-16 setting                                                         |
| `kan-15-pr-merge-conflict.png`            | KAN-15 | PR showing "Can't automatically merge" after KAN-11 was squash-merged                                                          |
| `kan-16-lint-red-blocked.png`             | KAN-16 | PR with a deliberate lint error: `lint api` red, all 5 checks Required, merge button disabled                                  |
| `kan-16-typecheck-build-green.png`        | KAN-16 | All 5 checks green after adding type-check and build to the lint jobs                                                          |
| `kan-17-ruleset-not-enforced.png`         | KAN-17 | Ruleset configured but not enforced on a private repo on the free plan                                                         |
| `kan-17-required-checks.png`              | KAN-17 | `protect-main` ruleset requiring all 5 checks                                                                                  |
| `kan-70-er-diagram.png`                   | KAN-70 | The Mermaid ER diagram rendered on GitHub                                                                                      |
| `kan-18-studio-bill.png`                  | KAN-18 | Prisma Studio: the seeded bill (service 1000 bp, GST 900 bp)                                                                   |
| `kan-18-studio-item.png`                  | KAN-18 | Prisma Studio: Chicken Rice 600, Laksa 750, Tiger 800 × 2                                                                      |
| `kan-18-studio-claim.png`                 | KAN-18 | Prisma Studio: the 4 claims (Ben and Dan share Tiger)                                                                          |
| `kan-19-red.png`                          | KAN-19 | TDD red: 10 tests fail against the stub                                                                                        |
| `kan-19-green.png`                        | KAN-19 | TDD green: 10 tests pass                                                                                                       |
| `kan-20-red.png`                          | KAN-20 | TDD red: 11 allocation tests fail against the stub                                                                             |
| `kan-20-green.png`                        | KAN-20 | TDD green: 11 allocation tests pass                                                                                            |
| `kan-21-red.png`                          | KAN-21 | Property and regression tests failing (5 failed, 30 passed) before the BigInt fix                                              |
| `kan-21-green-coverage.png`               | KAN-21 | All 35 split tests pass with 100% coverage on `src/split`                                                                      |
| `kan-22-local-checks.png`                 | KAN-22 | Lint, Prettier and all tests passing locally before pushing                                                                    |
| `kan-22-five-checks-green.png`            | KAN-22 | All 5 CI checks (including gitleaks) green on the PR                                                                           |
| `kan-22-dependabot-group-one-update.png`  | KAN-22 | Dependabot vitest group PR bumping only `vitest`, not `@vitest/coverage-v8`                                                    |
| `kan-22-push-protection-blocked.png`      | KAN-22 | GitHub push protection rejecting a push with a fake AWS key (GH013)                                                            |
| `kan-22-gitleaks-blocks-pr.png`           | KAN-22 | Required gitleaks check failing on a fake API key, merge button disabled                                                       |
| `kan-69-container-diagram.png`            | KAN-69 | Container diagram rendered on GitHub                                                                                           |
| `kan-23-board.png`                        | KAN-23 | Sprint 1 board at the end: 17 Done, only KAN-23 left                                                                           |
| `kan-23-burndown.png`                     | KAN-23 | Sprint 1 burndown: 37 points done, 1 to go, well ahead of the guideline                                                        |
| `kan-74-red.png`                          | KAN-74 | TDD red: 19 split-mode tests fail against the stub; the 2 property tests still pass                                            |
| `kan-74-green.png`                        | KAN-74 | TDD green: all 21 split-mode tests pass                                                                                        |
| `kan-74-tdd-red-green-pr.png`             | KAN-74 | PR showing the red commit before the green commit, all 5 checks passing                                                        |
| `kan-34-test-e2e-green.png`               | KAN-34 | First CI run of `test-e2e` (Postgres 18 service container): all 6 checks green                                                 |
| `kan-34-broken-split-blocked.png`         | KAN-34 | Deliberately broken split engine: `test-api` and `test-e2e` fail as required checks, merge disabled; lint and build stay green |
| `kan-36-seven-checks.png`                 | KAN-36 | All 7 required checks green, including the new `docker-build`                                                                  |
| `kan-36-deploy-run.png`                   | KAN-36 | First Deploy workflow run on `main` building and pushing the image                                                             |
| `kan-36-ghcr-sha-tag.png`                 | KAN-36 | `splitlah-api` in GHCR, tagged `latest` and with the commit SHA                                                                |
| `kan-35-budget-alert.png`                 | KAN-35 | AWS monthly budget alert (US$10), status healthy, $0.00 used                                                                   |
| `kan-35-setup-server-done.png`            | KAN-35 | `setup-server.sh` finished on EC2: Docker, Compose and 1 GB swap                                                               |
| `kan-37-deploy-runs-red-then-green.png`   | KAN-37 | Deploy runs: #7 failed at the OIDC login, #8 green after fixing the trust policy `sub`                                         |
| `kan-37-deploy-run-green.png`             | KAN-37 | Deploy #8: `build-image` 1m 4s → `deploy` 1m 35s to production                                                                 |
| `kan-37-live-health-browser.png`          | KAN-37 | `http://47.129.169.19/api/health` answering from EC2                                                                           |
| `kan-37-ssh-rule-open-during-deploy.png`  | KAN-37 | Security group during a deploy: the runner's `/32` SSH rule next to my own                                                     |
| `kan-37-ssh-rule-closed-after-deploy.png` | KAN-37 | Same security group after the deploy: only my own IP for SSH                                                                   |
| `kan-37-jira-deployment.png`              | KAN-37 | Jira KAN-37 Development panel showing 1 deployment to Production                                                               |
| `kan-37-redeploy-idempotent.png`          | KAN-37 | Re-running the deploy: `No pending migrations to apply`, then `Healthy`                                                        |
| `kan-35-deploy-ssh-docker-ps.png`         | KAN-35 | `ssh deploy@<server> docker ps` working with the GitHub Actions key                                                            |
| `kan-33-gemini-free-limits.png`           | KAN-33 | AI Studio free limits for Gemini 3.8 Flash: 5 per minute, 20 per day                                                           |
| `kan-33-gemini-limits-by-model.png`       | KAN-33 | Free limits by model: 3.5 Flash-Lite allows 500 a day vs 20 for the Flash models                                               |
| `kan-33-gemini-on-in-production.png`      | KAN-33 | Server redeploy after adding the Gemini settings to `.env`: `Healthy`, and the API container reports `OCR_PROVIDER` = `gemini` |
| `kan-75-rds-sg-inbound.png`               | KAN-75 | `rds-sg`: port 5432 allowed only from a security group, not an IP (account ID blacked out)                                     |
| `kan-75-rds-connectivity.png`             | KAN-75 | RDS Connectivity & security: Publicly accessible No, only `rds-sg`, private subnets                                            |
| `kan-75-rds-backups.png`                  | KAN-75 | RDS Maintenance & backups: automated backups enabled, kept 1 day                                                               |
| `kan-75-app-user-connects.png`            | KAN-75 | `psql` as `app` on database `splitlah`: PostgreSQL 18.3                                                                        |
| `kan-75-migrate-on-rds.png`               | KAN-75 | `migrate` container applying all 3 migrations to RDS before the switch                                                         |
| `kan-75-redeploy-on-rds.png`              | KAN-75 | Redeploy after the app password change: migrations checked on RDS, only the API container starts, `Healthy`                    |
| `kan-38-board-burndown.png`               | KAN-38 | Sprint 2 board (17 done) and burndown: 51 of 51 points, below the guideline the whole sprint                                   |
| `kan-39-iphone-https.png`                 | KAN-39 | iPhone Safari opening `https://splitlah.duckdns.org` with no "Not Secure" warning                                              |
| `kan-39-restart-keeps-certificate.png`    | KAN-39 | `docker compose restart` on the server: same certificate afterwards; only `web` publishes 80 and 443 (my IP blacked out)       |
