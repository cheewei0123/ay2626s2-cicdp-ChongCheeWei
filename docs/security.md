# Security

Two parts: the app checked against a web application security checklist (KAN-96), then what the pipeline scans, what it found, and the risks I accepted (KAN-22: Gitleaks, push protection, Dependabot; KAN-41: CodeQL, npm audit, Trivy).

## Web application security checklist (KAN-96)

Based on the OWASP Top 10 (2021). Each item: how SplitLah meets it, or why it doesn't.

| #   | Item                                   | How SplitLah meets it                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Access control (A01)                   | Every route needs a login (`JwtAuthGuard`) except log in, register, the email and reset links, the share link and the Telegram webhook. Bill routes also pass `BillOwnerGuard`: another user's bill answers `404`, so ids can't be probed. Friends reach a bill only through its share token (128 random bits) or join code, never by id.                   |
| 2   | Passwords stored safely (A02)          | Salted **scrypt** hash only (`password.ts`), compared in constant time. Login checks a dummy hash when the email doesn't exist, so the reply time doesn't reveal which emails have accounts.                                                                                                                                                                |
| 3   | Secrets out of the code (A02)          | Only in GitHub Secrets and the server's `/opt/splitlah/.env`. Gitleaks scans every commit and GitHub push protection checks every push (see below). Two-step login secrets are stored encrypted (AES-256-GCM, `secret-box.ts`).                                                                                                                             |
| 4   | HTTPS everywhere (A02)                 | Caddy gets a Let's Encrypt certificate and redirects `http://` to `https://`. **HSTS** (`Strict-Transport-Security`, one year) tells the browser never to use plain HTTP for the site.                                                                                                                                                                      |
| 5   | Injection: SQL (A03)                   | All database access goes through Prisma, which sends values as parameters, never as SQL text. There is no raw SQL.                                                                                                                                                                                                                                          |
| 6   | Injection: XSS (A03)                   | React escapes all text it shows; there is no `dangerouslySetInnerHTML`. The web server sends a **Content Security Policy**: scripts only from our own files and Google's sign-in script, and no inline scripts, so an injected `<script>` would not run.                                                                                                    |
| 7   | Input checked on the server (A03, A04) | A global `ValidationPipe` checks every body against its DTO; unknown fields and bad values get `400`. Receipt photos: JPEG or PNG only, at most 5 MB.                                                                                                                                                                                                       |
| 8   | Rate limits on risky routes (A04, A07) | Every IP gets 100 requests a minute overall, and each risky route has its own, stricter limit (table below). Limits are per client IP: Caddy passes the real IP and the API trusts exactly one proxy, so a client can't fake another IP.                                                                                                                    |
| 9   | Security headers (A05)                 | API: `helmet`. Web: set in `apps/web/Caddyfile`: CSP, HSTS, `X-Frame-Options: DENY` and `frame-ancestors 'none'` (no other site can frame SplitLah, so no clickjacking), `nosniff`, `Referrer-Policy` (other sites never see a path like `/share/<token>`), `Permissions-Policy` (camera only for us; microphone and location off), and no `Server` header. |
| 10  | CORS (A05)                             | The API only accepts browser calls from our own site (`WEB_ORIGIN`).                                                                                                                                                                                                                                                                                        |
| 11  | Errors don't leak details (A05)        | `AllExceptionsFilter` sends only a status and a short message. Anything unexpected is a plain `500 Internal server error`; its details go to the server log only, and no stack trace in production.                                                                                                                                                         |
| 12  | Known-vulnerable packages (A06)        | `npm audit`, Trivy (images), CodeQL and Dependabot (see below). HIGH or CRITICAL fails the PR.                                                                                                                                                                                                                                                              |
| 13  | Login and sessions (A07)               | Optional two-step login with an authenticator app (KAN-92). Each login is a server-side session for 14 days; logout ends it, and a password change or reset ends all of them (KAN-97). "Continue with Google" checks Google's signed ID token on the server (KAN-95).                                                                                       |
| 14  | Account enumeration (A07)              | Wrong email and wrong password give the same `401`; forgot-password answers `204` whether or not the account exists.                                                                                                                                                                                                                                        |
| 15  | One-time links and codes (A07)         | Email and reset links are 256 random bits, stored only as a SHA-256 hash, and expire (24 hours, 30 minutes). SMS codes last 10 minutes and are used up after 5 wrong tries. Two-step backup codes are hashed and work once.                                                                                                                                 |
| 16  | Integrity of what is deployed (A08)    | Images are built and scanned in CI and deployed by tag; third-party Actions are pinned to a commit SHA; `main` is protected and needs the 15 checks.                                                                                                                                                                                                        |
| 17  | Logging (A09)                          | Every request is logged with method, path, status, time and a request id; request bodies (passwords, tokens) are never logged. Logs stay on the server (`docker compose logs`).                                                                                                                                                                             |
| 18  | Server-side request forgery (A10)      | The API only calls fixed hosts (Gemini, Resend, Twilio, Telegram, Google); no URL comes from the user.                                                                                                                                                                                                                                                      |
| 19  | Deleting your data                     | Anyone can delete their account (KAN-93). It is closed at once and wiped 6 months later.                                                                                                                                                                                                                                                                    |
| 20  | Webhook from Telegram                  | Accepted only with the secret header set in `setWebhook`, compared in constant time.                                                                                                                                                                                                                                                                        |

**Not done, and why:**

- **No per-account lockout** after many wrong passwords. Limits are per IP, so many IPs could still try one account slowly. A lockout would let anyone lock a friend out on purpose. Instead: scrypt is slow, two-step login is available, and the email is never revealed.
- **CSP allows `data:` images and fonts, and `blob:` images:** the receipt preview is a `blob:` URL of the photo just picked, and Vite puts the smallest font file straight into the stylesheet as `data:`. Images and fonts can't run script.
- **Rate limits live in the API's memory:** fine for one API container; they reset when it restarts. More than one container would need a shared store such as Redis.

### Rate limits on risky routes

| Route                                                | Why it is risky                     | Limit (per IP)                               |
| ---------------------------------------------------- | ----------------------------------- | -------------------------------------------- |
| `POST /auth/login`, `/auth/google`                   | Checks a password or a Google token | 10 a minute                                  |
| `POST /auth/register`                                | Sends an email                      | 10 a minute                                  |
| `POST /auth/verify-email`, `/auth/reset-password`    | Checks a link token                 | 10 a minute                                  |
| `POST /auth/mfa`                                     | Checks a 6-digit code               | 5 a minute (the try lasts 5 minutes)         |
| `POST /auth/resend-verification`                     | Sends an email                      | 3 an hour                                    |
| `POST /auth/forgot-password`                         | Sends an email                      | 5 an hour                                    |
| `POST /me/password`, `DELETE /me`                    | Checks a password                   | 5 a minute                                   |
| `POST /me/mfa/setup`, `/enable`, `/disable`          | Checks a password or a code         | 5 a minute                                   |
| `POST /me/phone`                                     | Sends an SMS (costs money)          | 3 per 10 minutes, and 1 a minute per account |
| `POST /me/phone/telegram`                            | Starts a Telegram check             | 5 per 10 minutes                             |
| `POST /me/phone/verify`                              | Checks a 6-digit code               | 10 a minute, and 5 tries per code            |
| `POST /bills/:id/receipt`, `/expenses/receipt`       | Calls the AI (Gemini)               | 5 a minute, and 20 scans a day per account   |
| `POST /share/:token/participants`, `GET /join/:code` | Guessing a link or a code           | 20 a minute                                  |
| `POST /telegram/webhook`                             | Only Telegram's servers call it     | None: the secret header is checked first     |

## Security scans

### What is scanned, and where

| Scan                       | Looks at                                                       | Runs                                   | Fails the PR when                                    |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Gitleaks                   | Every commit in the history, for keys, tokens and passwords    | `ci.yml`, every PR and push to `main`  | Any secret is found                                  |
| GitHub push protection     | Each `git push`, for known provider key formats                | GitHub, before the push is accepted    | The push itself is refused                           |
| CodeQL                     | Our TypeScript (API and web) and the workflow files themselves | `codeql.yml`, every PR, `main`, weekly | A new security finding (`security-extended` queries) |
| `npm audit` (via audit-ci) | Every package in `package-lock.json`                           | `ci.yml` job `npm audit`               | A HIGH or CRITICAL advisory not in `audit-ci.jsonc`  |
| Trivy                      | What we ship: the OS packages and binaries inside each image   | `ci.yml` jobs `trivy api`, `trivy web` | A HIGH or CRITICAL CVE that has a fix                |
| Dependabot                 | npm packages, GitHub Actions and Docker base images            | Weekly, as PRs through the same checks | (it opens PRs; the checks above decide)              |

Each one sees something the others can't: CodeQL reads our code, `npm audit` reads our dependency list, Trivy reads the finished image (including things we never listed, like the npm that comes with Node), and Gitleaks reads history. Results from CodeQL and Trivy go to the repo's **Security → Code scanning** tab.

### What Trivy found first (17 Nov 2026)

| Image          | Finding                                                                                                   | Where it came from                                                         | What I did                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `splitlah-api` | 6 HIGH: `brace-expansion` 5.0.9 (2 CVEs), `undici` 6.28.0 (4 CVEs)                                        | The **npm CLI** bundled in the `node:24-slim` base image, not our packages | Deleted npm from the runtime image: **0 HIGH left**                                   |
| `splitlah-web` | 1 HIGH: `golang.org/x/net` v0.60.0 (CVE-2026-78661); on 20 Nov a 2nd: Go `stdlib` 1.27.3 (CVE-2026-97054) | Inside the **Caddy** binary (v2.11.9, the newest release)                  | First accepted with an expiry date; then **Caddy rebuilt** with the fixes: **0 HIGH** |

`npm audit` reported 0 at the same time. It only reads our lockfile, so it could not see the npm that ships inside the base image. That is the reason to scan the image as well.

Removing npm is safe because the API runs with `node dist/main.js` and its health check uses `node -e`. The `migrate` image is built from the `build` stage, which keeps npm for `npx prisma migrate deploy`.

### Accepted risks

Trivy's would be listed in `.trivyignore.yaml` with an expiry date, so they can't stay ignored forever by accident: after the date Trivy fails the check again. That list is empty now (see Caddy below). `npm audit` has no way to skip one advisory, so it runs through [audit-ci](https://github.com/IBM/audit-ci) (pinned to 7.1.0) with `audit-ci.jsonc`; audit-ci has no expiry field, so the review date is written next to the entry.

| CVE                 | Where                                                               | Why it is accepted                                                                                                                                                                                                                                                                                                                                                                       | Until       |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| GHSA-7589-6fvf-x4pw | `effect` 3.20.0 inside the Prisma CLI (`prisma` → `@prisma/config`) | A ReDoS in `Schema.TemplateLiteral`, published after the first scan. Prisma 7.10.1 (the newest) pins `effect` to exactly 3.20.0; an npm `overrides` entry did not change it and left the install broken, so it can't be patched from our side. The CLI only runs in CI and the migrate image, and only reads our own `prisma.config.ts`, never user input. Accepted in `audit-ci.jsonc`. | 31 Dec 2026 |

**Fixing instead of accepting (Caddy).** The Caddy CVE was first accepted until 31 Dec 2026. Three days later the PR's `trivy web` check failed on a second one in the same binary (Go's standard library), published after my local scan. No Caddy release has either fix, but Caddy's official builder image already has the fixed Go (1.27.4), so `apps/web/Dockerfile` now rebuilds the **same** Caddy release (v2.11.9) with `xcaddy`, Go 1.27.4 and `x/net` v0.62.0. The image scans clean with no ignore file, so `.trivyignore.yaml` is empty again. The rebuilt binary is copied over the official one, and `setcap cap_net_bind_service` is set again so the non-root `caddy` user can still use ports 80 and 443. Remove that stage once an official Caddy release includes the fixes.

**False positive (CodeQL alert #5, reviewed 22 Nov 2026, KAN-50).** CodeQL reports `js/xss-through-dom` (High) on `apps/web/src/pages/ScanReceipt.tsx`, `<img src={preview}>`. `preview` is always `URL.createObjectURL(file)`: a `blob:` URL of the photo the user just picked on their own device, used only as an image source. An image can't run script and no text is parsed as HTML, so there is no XSS path. It was dismissed as a false positive in the Security tab on 22 Nov with this reason (0 open alerts), instead of changing safe code to quiet the scanner.

`ignore-unfixed` is on: a CVE with no fix anywhere can't be acted on, so it is shown but doesn't fail the build.

### Securing the scanners themselves

- **Trivy's action is pinned to a full commit SHA** (`ed142fd…`, v0.36.0), not a tag. In March 2026 attackers force-pushed 76 of `aquasecurity/trivy-action`'s 77 tags to code that stole CI secrets (CVE-2026-33634). A tag can be moved; a commit SHA can't. v0.36.0 was released after the clean-up, and it pins its own `setup-trivy` by SHA too.
- The Trivy binary is pinned as well (`version: v0.76.2`), so a bad "latest" release can't slip in.
- **Every third-party action is pinned to a commit SHA** with its version in a comment (Gitleaks, Docker's build actions, the AWS credentials action, Trivy). CodeQL's own scan of the workflows flagged the Docker ones on the first PR. Only GitHub's own actions (`actions/*`, `github/codeql-action`) stay on major tags. Dependabot updates the SHAs and their comments.
- `ci.yml` sets `permissions: contents: read` for the whole workflow, so a job's token can only read the code unless the job asks for more (Gitleaks: comment on the PR; Trivy: upload to the Security tab). CodeQL flagged the `npm audit` job, which had no limit.
- CodeQL also scans the `actions` language, i.e. the workflow files, for problems like untrusted input in `run:` lines.

### Trade-offs

- **Time:** the Trivy jobs rebuild each image (from Docker's layer cache) and download Trivy's database, and CodeQL takes a few minutes. They run in parallel with the other jobs, so the PR waits for the slowest one, not the sum.
- **False positives and noise:** the first scan's findings were all in code we don't run (npm inside the image) or couldn't fix with a normal update (Caddy, fixed by rebuilding it). Each needed a decision, not just a green tick. Accepting a risk is written down with a reason and an end date.
- **Free plan:** code scanning and the Security tab are free because the repo is public.
