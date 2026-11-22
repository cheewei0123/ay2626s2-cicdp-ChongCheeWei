# Security scans

What the pipeline scans, what it found, and the risks I accepted. Built in KAN-22 (Gitleaks, push protection, Dependabot) and KAN-41 (CodeQL, npm audit, Trivy).

## What is scanned, and where

| Scan                       | Looks at                                                       | Runs                                   | Fails the PR when                                    |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Gitleaks                   | Every commit in the history, for keys, tokens and passwords    | `ci.yml`, every PR and push to `main`  | Any secret is found                                  |
| GitHub push protection     | Each `git push`, for known provider key formats                | GitHub, before the push is accepted    | The push itself is refused                           |
| CodeQL                     | Our TypeScript (API and web) and the workflow files themselves | `codeql.yml`, every PR, `main`, weekly | A new security finding (`security-extended` queries) |
| `npm audit` (via audit-ci) | Every package in `package-lock.json`                           | `ci.yml` job `npm audit`               | A HIGH or CRITICAL advisory not in `audit-ci.jsonc`  |
| Trivy                      | What we ship: the OS packages and binaries inside each image   | `ci.yml` jobs `trivy api`, `trivy web` | A HIGH or CRITICAL CVE that has a fix                |
| Dependabot                 | npm packages, GitHub Actions and Docker base images            | Weekly, as PRs through the same checks | (it opens PRs; the checks above decide)              |

Each one sees something the others can't: CodeQL reads our code, `npm audit` reads our dependency list, Trivy reads the finished image (including things we never listed, like the npm that comes with Node), and Gitleaks reads history. Results from CodeQL and Trivy go to the repo's **Security → Code scanning** tab.

## What Trivy found first (17 Nov 2026)

| Image          | Finding                                                                                                   | Where it came from                                                         | What I did                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `splitlah-api` | 6 HIGH: `brace-expansion` 5.0.9 (2 CVEs), `undici` 6.28.0 (4 CVEs)                                        | The **npm CLI** bundled in the `node:24-slim` base image, not our packages | Deleted npm from the runtime image: **0 HIGH left**                                   |
| `splitlah-web` | 1 HIGH: `golang.org/x/net` v0.60.0 (CVE-2026-78661); on 20 Nov a 2nd: Go `stdlib` 1.27.3 (CVE-2026-97054) | Inside the **Caddy** binary (v2.11.9, the newest release)                  | First accepted with an expiry date; then **Caddy rebuilt** with the fixes: **0 HIGH** |

`npm audit` reported 0 at the same time. It only reads our lockfile, so it could not see the npm that ships inside the base image. That is the reason to scan the image as well.

Removing npm is safe because the API runs with `node dist/main.js` and its health check uses `node -e`. The `migrate` image is built from the `build` stage, which keeps npm for `npx prisma migrate deploy`.

## Accepted risks

Trivy's would be listed in `.trivyignore.yaml` with an expiry date, so they can't stay ignored forever by accident: after the date Trivy fails the check again. That list is empty now (see Caddy below). `npm audit` has no way to skip one advisory, so it runs through [audit-ci](https://github.com/IBM/audit-ci) (pinned to 7.1.0) with `audit-ci.jsonc`; audit-ci has no expiry field, so the review date is written next to the entry.

| CVE                 | Where                                                               | Why it is accepted                                                                                                                                                                                                                                                                                                                                                                       | Until       |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| GHSA-7589-6fvf-x4pw | `effect` 3.20.0 inside the Prisma CLI (`prisma` → `@prisma/config`) | A ReDoS in `Schema.TemplateLiteral`, published after the first scan. Prisma 7.10.1 (the newest) pins `effect` to exactly 3.20.0; an npm `overrides` entry did not change it and left the install broken, so it can't be patched from our side. The CLI only runs in CI and the migrate image, and only reads our own `prisma.config.ts`, never user input. Accepted in `audit-ci.jsonc`. | 31 Dec 2026 |

**Fixing instead of accepting (Caddy).** The Caddy CVE was first accepted until 31 Dec 2026. Three days later the PR's `trivy web` check failed on a second one in the same binary (Go's standard library), published after my local scan. No Caddy release has either fix, but Caddy's official builder image already has the fixed Go (1.27.4), so `apps/web/Dockerfile` now rebuilds the **same** Caddy release (v2.11.9) with `xcaddy`, Go 1.27.4 and `x/net` v0.62.0. The image scans clean with no ignore file, so `.trivyignore.yaml` is empty again. The rebuilt binary is copied over the official one, and `setcap cap_net_bind_service` is set again so the non-root `caddy` user can still use ports 80 and 443. Remove that stage once an official Caddy release includes the fixes.

**False positive (CodeQL alert #5, reviewed 22 Nov 2026, KAN-50).** CodeQL reports `js/xss-through-dom` (High) on `apps/web/src/pages/ScanReceipt.tsx`, `<img src={preview}>`. `preview` is always `URL.createObjectURL(file)`: a `blob:` URL of the photo the user just picked on their own device, used only as an image source. An image can't run script and no text is parsed as HTML, so there is no XSS path. It is dismissed as a false positive in the Security tab with this reason, instead of changing safe code to quiet the scanner.

`ignore-unfixed` is on: a CVE with no fix anywhere can't be acted on, so it is shown but doesn't fail the build.

## Securing the scanners themselves

- **Trivy's action is pinned to a full commit SHA** (`ed142fd…`, v0.36.0), not a tag. In March 2026 attackers force-pushed 76 of `aquasecurity/trivy-action`'s 77 tags to code that stole CI secrets (CVE-2026-33634). A tag can be moved; a commit SHA can't. v0.36.0 was released after the clean-up, and it pins its own `setup-trivy` by SHA too.
- The Trivy binary is pinned as well (`version: v0.76.2`), so a bad "latest" release can't slip in.
- **Every third-party action is pinned to a commit SHA** with its version in a comment (Gitleaks, Docker's build actions, the AWS credentials action, Trivy). CodeQL's own scan of the workflows flagged the Docker ones on the first PR. Only GitHub's own actions (`actions/*`, `github/codeql-action`) stay on major tags. Dependabot updates the SHAs and their comments.
- `ci.yml` sets `permissions: contents: read` for the whole workflow, so a job's token can only read the code unless the job asks for more (Gitleaks: comment on the PR; Trivy: upload to the Security tab). CodeQL flagged the `npm audit` job, which had no limit.
- CodeQL also scans the `actions` language, i.e. the workflow files, for problems like untrusted input in `run:` lines.

## Trade-offs

- **Time:** the Trivy jobs rebuild each image (from Docker's layer cache) and download Trivy's database, and CodeQL takes a few minutes. They run in parallel with the other jobs, so the PR waits for the slowest one, not the sum.
- **False positives and noise:** the first scan's findings were all in code we don't run (npm inside the image) or couldn't fix with a normal update (Caddy, fixed by rebuilding it). Each needed a decision, not just a green tick. Accepting a risk is written down with a reason and an end date.
- **Free plan:** code scanning and the Security tab are free because the repo is public.
