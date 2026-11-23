# Learning log

Short notes on what I learned and what went wrong, newest first. Used as evidence for the report.

## KAN-91: a PayNow number has to be proved, not typed

- **Why it matters:** the guest's QR sends real money to the owner's number. Before this, a typo in Profile meant a friend's money went to a stranger's PayNow, and nothing ever checked it. Now the guest view only shows a number that was proved by an SMS code.
- **Old number until the new one is proved:** the number being checked waits in its own table (`PhoneVerification`, one per user) and only moves into `paynowMobile` when the code is right, so changing your number never leaves you without one.
- **Same pattern a third time:** `SMS_PROVIDER` picks a fake sender (tests, CI, local; it logs the code) or Amazon SNS, exactly like `EMAIL_PROVIDER` and `OCR_PROVIDER`. CI never sends a real text.
- **No AWS key anywhere:** SNS is called with the EC2 instance's IAM role, allowed only `sns:Publish`. A container is one network hop further than the instance, so the metadata hop limit has to be 2 or the SDK can't find the role.
- **Rate limits because texts cost money:** 3 requests per 10 minutes per IP, one SMS a minute per account, 5 wrong codes per code, and the SNS spend limit of US$1 a month as the last line.
- **The client was hiding the useful error:** it turned every 5xx into "Something went wrong on our side". A 503 from the SMS service says what to do ("check the number"), so a 503 with its own sentence is now shown as it is.
- **A stale dev server looked like a bug:** the page said "Cannot POST /api/me/phone" because the watcher had compiled before `prisma generate`, and an old process still held port 3000. Restarting it cleanly fixed it; the tests had been right all along.

## KAN-94: a calendar and a chart that is honest about colour

- **The API change was small:** the list and the summary take `from` and `to` as well as `month`, as whole Singapore days, and the summary adds a total per day. The rules (together, in order, 366 days at most) are checked once in the service and tested at both levels.
- **A pie of 10 categories can't be colour-safe.** I ran the dataviz validator on an 8-hue palette against our glass surface: it passes when only neighbours are compared (bars), but in a pie any two slices can touch, and then it fails (green and orange look the same to colour-blind eyes). So the pie colours by rank on one violet ramp, keeps 6 slices at most, and the category name always sits beside its swatch.
- **Looking at it found a bug the tests missed:** the last day's label ("30") was cut off at the chart's edge, and a 7-day range only labelled its first and last day. Both were fixed after the screenshot, not before.
- **Lint caught two React mistakes:** reading today's date during render (moved into `useState`), and adding up slice positions with a variable changed during render (moved into the pure `slicesOf`).

## KAN-60: a Gantt chart from what actually happened

- **Plan and reality side by side:** the chart shows each sprint as planned in Jira and as it ran. Sprints 1 and 2 closed 3 and 5 days early; Sprint 3 ran its full 13 days.
- **Epic bars come from git, not memory:** each ticket key in a squash-merge title was mapped to its epic through Jira's parent field, and the bar runs from the epic's first merge to its last. That showed PayNow was merged in a single day (22 Nov), and that pipeline work never stopped, from 3 to 22 Nov.
- **Same tooling as the other diagrams:** a Mermaid `gantt` in `docs/diagrams/gantt.mmd`, rendered locally, so it can be redrawn after Sprint 4.

## KAN-77, KAN-80: switching real email on, and the phone checks

- **Gmail needs an app password:** SMTP login with the normal Google password is refused, and app passwords only exist once 2-Step Verification is on. The 16-character password went straight into the server's `.env`, never into git or chat.
- **Two surprises on the server:** `/opt/splitlah` belongs to `deploy` (mode 750), so the `ubuntu` login can't even `cd` into it, and the Compose file needs `TAG`, which only `deploy.sh` sets. `sudo -iu deploy` and `export TAG=$(cat .deployed-tag)` fixed both; the steps are now in [infra.md](infra.md) so the next change to `.env` doesn't hit them again.
- **`up -d`, not `restart`:** `env_file` is read when a container is created, so only recreating it loads the new settings.
- **It worked first time on the phone:** the email arrived within a minute and the link verified the account. The fake sender kept CI free of real email the whole time, and switching was one setting (`EMAIL_PROVIDER=smtp`), the same pattern as the receipt reader.
- **Expenses on the iPhone:** a typed expense guessed "Food & drinks" from the name "Cafe", and a receipt photo filled in the total (54.50), merchant and date. The receipt was a sample from 2007, so the month view jumped to Jul 2007: it follows the expense's date, not today's.
- **Evidence from a public repo:** my email address and the verification token are blurred in the screenshots before they were committed.

## KAN-50, KAN-51: evidence and diagrams that match the code

- **Diagrams go stale like numbers do:** the ER diagram from Sprint 1 still showed `Group`, `Friendship` and `Budget` (never built) and was missing three tables that were (`EmailVerificationToken`, `ReceiptImage`, `MerchantCategory`). I redrew it from `schema.prisma` itself, not from memory, and marked the four columns no code uses yet as "unused" instead of hiding them.
- **The pipeline diagram was wrong too:** it drew the PR checks as a chain (lint → tests → security → build), but `ci.yml` has no `needs:` between them, so all 13 start together. The new diagram groups them into four boxes that run side by side, which is also why a PR waits for the slowest check, not the sum.
- **One place for every diagram:** the Mermaid sources now live in `docs/diagrams/`, so a change to the code means editing one `.mmd` file and rendering it again. They are rendered locally (a headless browser), so the project's schema is never pasted into an online tool.
- **A scanner finding is not always a bug:** CodeQL flagged `<img src={preview}>` as XSS through the DOM. `preview` can only be a `blob:` URL of the user's own photo, and an image can't run script, so it is a false positive. Dismissing it with a written reason keeps the Security tab honest; rewriting safe code just to quiet the scanner would hide the reasoning.
- **Coverage, measured again on `main`:** 404 API tests, 97.91% lines and 95.02% branches, saved as a text file so the number in the report can be checked.

## KAN-58: the deploy had become three times slower

- **Found while writing the report, not by watching:** the report said "merge to live in about 2½ minutes". The deploy runs' own timings (GitHub API) said otherwise: a median of about 7½ minutes on 21–22 Nov, over the 5-minute target. A number written once goes stale unless it is measured again.
- **Reading the build log, step by step:** about 75 s went on building Caddy from source (`xcaddy build`) on every run, although the base image digest and the command were the same each time, and about 3 minutes went on saving the cache.
- **The cause:** all three image builds used `type=gha` with no scope, so they shared one cache record. The API build saved its record, the migrate build replaced it, and the web build then found no Caddy layer. Each build "used the cache" and still missed.
- **The fix:** one scope per Dockerfile (`api`, `web`), in both `ci.yml` and `deploy.yml`; the migrate image only reads the `api` scope, since its layers are the API build stage.
- **Lesson:** "cache enabled" is not the same as "cache hit". The log line to check is `CACHED` on the slow step.
- **Measured after the fix:** the first deploy (#46) still took 8 min 16 s, because it filled the new, empty scopes. The next one (#47, started by hand on the same commit) took 2 min 29 s, and the image build went from 4–6½ minutes to 64 s. A real code change rebuilds a few more layers, so I don't claim 2½ minutes for every merge.
- **A better failure screenshot:** my old one was a single very wide log line, unreadable in the report. A narrower browser window wraps the log, and the same view shows the steps after the failure: "Close SSH again" still ran and "Check it is live" was skipped.
- **The report's onboarding story** (section 3.5) came straight from this log: the interface token (KAN-31), module exports (KAN-49), `reflect-metadata` in a DTO test (KAN-76) and the Express 5 parameter type that only the build caught (KAN-26).

## KAN-57: explaining the architecture

- **The diagrams were drawn from the code, not from memory:** the module diagram follows each module's real `imports`, which showed my old table was out of date (a `UsersModule` that was never built, a Tesseract reader I dropped, "planned" modules that are now finished).
- **An event is a dependency too, just a looser one:** `BillsModule` never imports `ExpensesModule`, but they still depend on the `bill.locked` event's shape. I drew it as a dashed line so the diagram doesn't pretend they are unrelated.
- **Rendering without sending my code anywhere:** online Mermaid renderers upload the diagram source, so I rendered them locally in Playwright's WebKit and saved PNGs for the report.
- **Numbered steps tie the picture to the text:** `autonumber` on the sequence diagram lets the report walk through it as "(7–12) …" instead of repeating every arrow.
- **Explaining where each cent goes:** the report's table works the brief's bill through step by step. The exact GST shares are 59.39, 74.24, 79.19 and 79.19, so after rounding down one cent is left and goes to Chee (largest fraction), giving 720/899/959/959, the same numbers the unit test checks.

## KAN-55: load testing with k6

- **My own rate limits shape the test:** 10 users from one machine on a share link would mostly get `429` (100 a minute per IP), and that measures the limiter, not the server. So the load goes to the app page and `/api/health`, which have no limit but still go through Caddy, NestJS and RDS.
- **Testing the limit on purpose:** a second scenario sends 25 join-code guesses and checks that the first 20 get `404` and the rest `429`. It proves the brute-force protection works on the live server, where the real client IP comes through Caddy (`trust proxy`).
- **Thresholds only for the load:** `http_req_failed{scenario:load}` leaves out the expected 404s and 429s, which would otherwise count as failures.
- **Manual on purpose:** `workflow_dispatch` only, so PRs never load production. It has to be on `main` before the Run button appears, so the results come in a second PR.
- **Collecting server stats without my laptop:** SSH from my laptop only works from my home IP, and it had changed. Instead the workflow gets in like the deploy does (the `production` environment, OIDC, port 22 opened for the runner only and always closed) and samples `docker stats` in the background while k6 runs.
- **Reading the numbers honestly:** p50 and p95 were only 5 ms apart and the API used 2–3% CPU, so the ~200 ms is mostly the trip from GitHub's US runner to Singapore, not my server. The tightest resource turned out to be memory (about 500 of 909 MiB used, swap already in use), not CPU.
- **Background jobs start together:** I wrote that the first sample was "before any load", but the SSH sampler and k6 start at the same moment, so it is a few seconds in. The run's timestamps showed it, and I fixed the comment.
- **Inputs are not safe to paste into a script:** `${{ inputs.base_url }}` directly in `run:` would let a crafted input run shell commands. It goes through `env:` instead, which CodeQL's actions check looks for.

## KAN-54: a README a stranger can follow

- **Write it for someone who has never seen the repo:** the setup section is the exact commands in order (clone → `npm ci` → Postgres in Docker → copy `.env.example` → `JWT_SECRET` → migrate → seed → start). I checked every command against the repo, not from memory: Postgres listens on 5433 (not 5432), and Vite's proxy passes `/api` to `:3000`.
- **What a newcomer gets stuck on:** with the Fake email nothing arrives in an inbox, so the README says the verify link is in the API terminal. The seeded user can't log in (its password is a placeholder), so it says to Register and use join code `SEED2` for the guest side.
- **No real values, ever:** the environment table gives each variable's purpose and a safe example, and says the real ones live only in GitHub Secrets and the server's `.env`.
- **Links checked by a script:** a short Python check that every relative link and image in both READMEs exists, so a moved doc doesn't leave a dead link.
- **The web app's README was still the Vite template**, which talks about ESLint (this repo uses oxlint). I replaced it with a short page that points back to the root README.

## KAN-53: browser tests with Playwright

- **The top of the pyramid tests the real images:** `docker-compose.ci.yml` starts the same API and Caddy images as production, with a throwaway Postgres in memory (`tmpfs`) and Fake OCR and email. So the browser test also proves the Caddyfile, the `/api` proxy and the migrations work together, which no unit or API test can.
- **iPhone 14 means WebKit:** Playwright's `devices['iPhone 14']` uses WebKit (Safari's engine) at 390 px with touch, which every browser on an iPhone uses, so the test checks what my users actually run, not Chrome.
- **Reading the email without an inbox:** the Fake email writes the verify link to the API log, and the test reads it with `docker compose logs api`. That way it opens the same link a person would click.
- **Asserting without hard-coding sums:** after changing Laksa to $8.50, the test reads "Our total" from the owner's screen, then the guest claims every item, so their total must be the same. If the split engine changes, the test still knows the right answer.
- **No video for my own page:** my first guest test made its own page with `browser.newPage()`, so a failure saved an empty trace and no video. Playwright only records the `page` it creates for each test, and each test already gets a fresh context, which is like a separate phone. I forced a failure once to check both files appear.
- **Keeping Vitest out of `e2e/`:** Vitest's default pattern also matches `*.spec.ts`, so it would try to run the Playwright files. My first fix (`src/**` only) quietly dropped `pwa.config.test.ts`; I caught it because the web test count fell from 168 to 164. The pattern now includes root `*.test.ts` too.

## KAN-77: verifying the email address

- **Store a hash, email the token:** the link carries 32 random bytes (`randomBytes(32).toString('base64url')`); the database only has its SHA-256. Someone who reads the database still can't verify an account. A plain hash is enough here (unlike passwords) because the token is random and long, not guessable.
- **One answer for every bad link:** unknown, used and expired tokens all get the same `400`, so the API doesn't say which tokens exist.
- **Used and verified together:** marking the token used and setting `emailVerifiedAt` happen in one `$transaction`, so a link can't be half-used.
- **The guard reads the database, not the JWT:** if "verified" were inside the login token, a user would have to log in again after clicking the link. `EmailVerifiedGuard` needs only `PrismaService` (global), so the bills and expenses modules use it without importing `AuthModule`.
- **The email must not break sign-up:** if Gmail is down, the account is still made and the error is logged; the banner's "Send again" retries.
- **The rate limit showed up in my own test:** the fourth "Send again" in the e2e test got `429` instead of the `401` I expected. The throttler runs before the login check, so I turned that into the test for the 3-an-hour limit.
- **Old tests needed verified users:** nine e2e files create bills. A small `markVerified` helper sets `emailVerifiedAt` straight in the database for them, and one new test (`verify-email.e2e-spec.ts`) goes through the real link.
- **React runs effects twice in development:** the `/verify` page would post the same one-time token twice and the second would fail. A `useRef` flag makes it post once.

## KAN-78: guessing the category, and remembering corrections

- **Three layers, cheapest and most personal first:** the user's own past choice for that merchant, then the category Gemini read from the receipt, then keyword rules. Each answer says where it came from (`memory`, `ai`, `rules`, `none`), which the Add page shows as a hint and the tests check.
- **One merchant, many spellings:** `merchantKey` lowercases and turns anything that isn't a letter or digit into one space, so "STARBUCKS Coffee!" and "Starbucks coffee" are the same row in `MerchantCategory` (unique on user + key).
- **Whole words in the rules:** `\b(bus)\b` stops "Business Centre" being Transport. The rules are a plain list, checked top to bottom, so they are easy to read and test without Gemini.
- **The AI's OTHERS is not an answer:** treating it as "no idea" lets the rules try, instead of locking in the least useful category.
- **A new table broke an old test's clean-up:** the KAN-79 e2e test changes a bill share's category, which now saves a `MerchantCategory` row; deleting the user then hit its foreign key. The test now deletes those rows first.
- **Counting corrections:** each change of category logs `category corrected from X to Y`, so how often the guess was wrong can be counted from the logs.

## KAN-80: the Expenses screens

- **A fixed sheet that wasn't fixed:** the edit sheet ran off the bottom of the phone. The page's `rise` animation keeps a `transform` on `<main>`, and `position: fixed` inside a transformed parent follows that parent, not the screen. `createPortal(sheet, document.body)` draws it outside `<main>`; React context (the router) still reaches it.
- **Singapore days on any phone:** the API groups months in Singapore time, so the list does too. `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })` gives `2026-12-01` for 00:30 on 1 Dec in Singapore, even though it is still 30 Nov in UTC.
- **The month is in the URL:** `/expenses?month=2026-11` with `useSearchParams`, so the back button and a refresh keep the month, and Add returns to the month you saved into.
- **Chart without a library:** one bar per category is a `div` with a width in %, inside the hero card. Plain ink bars, because the UI guide keeps colour for meaning, not decoration.
- **A bill share is half-editable:** amount, merchant and date come from the bill (the API answers `409`), so the sheet only shows category and note, plus a link back to the bill.
- **The linter caught a render loop risk:** calling `setError('')` straight inside the effect (`react(set-state-in-effect)`); it now clears when the data arrives.

## KAN-79: my share is logged as an expense when the bill is locked

- **An event instead of an import:** `ClaimsService.lock` sends `bill.locked` with `@nestjs/event-emitter`, and `BillShareListener` in the expenses code listens with `@OnEvent`. `BillsModule` never imports `ExpensesModule`; the only shared thing is the event's shape in `bill-events.ts`.
- **`emitAsync` + `suppressErrors: false`:** by default a listener's error is swallowed and `emit` doesn't wait. Waiting and letting errors through means the bill only turns `LOCKED` once the shares are saved; if saving fails, the bill stays `OPEN` and the owner can lock again.
- **Idempotent with an upsert:** `Expense` has `@@unique([userId, billId])`, so locking twice updates one row instead of adding another. The update leaves out category and note, so a person's own changes survive.
- **Summary first, then the bill:** the summary may create the owner's participant row the first time, so I read the participants after it, not alongside it with `Promise.all`.
- **Guests can't sign in yet:** only participants with a `userId` get a row, which today is the owner. The e2e test links one guest to an account in the database to prove the rest works.
- **Kept the lockfile clean:** `npm install` on Windows also dropped some unrelated Tailwind wasm entries from `package-lock.json`, so I rebuilt it from `main` and added only the two new packages.

## KAN-81: PayNow number on the Profile page

- **PATCH means "only what I send":** a field left out of the body arrives as `undefined`, and Prisma leaves that column alone. `null` is different: it clears the column, which is how the PayNow number is removed.
- **`@IsOptional()` lets `null` through:** it skips the other checks when the value is `null` or `undefined`, so `{ paynowMobile: null }` passes but `"91234567"` still fails `@Matches`. `forbidNonWhitelisted` means `{ email }` is refused, so the profile route can't change the login email.
- **The account can disappear:** a token lasts an hour, so `prisma.user.update` might find no row. Prisma throws `P2025`, the service turns it into `null`, and the controller answers `404`, the same as `GET /me`.
- **One place holds the user:** `saveProfile` in `AuthProvider` stores the `PATCH /me` answer, so My bills stops showing "Add your PayNow number" as soon as you go back, without loading `/me` again.
- **Cut on purpose:** uploading and decoding a PayNow QR from the bank app was planned, but typing the number gives the same QR, so it went to future work.

## KAN-49: the owner ticks who has paid

- **A new module that uses another one:** `PaymentsModule` imports `BillsModule`, which now `exports: [SummaryService]`. Nest only lets a module inject what another module exports, so the summary maths stays in one place and the payments code reuses it.
- **Guards from another folder:** `PaymentsController` uses `@UseGuards(JwtAuthGuard, BillOwnerGuard)` from the bills code. A guest token or someone else's login gets `401` / `403` before the service runs.
- **Snapshot, not a link:** `Payment.amountCents` stores what the person owed when ticked. If it only pointed at the bill, editing an item later would change what they had "paid".
- **SETTLED is worked out, not set by hand:** after each tick the service checks whether everyone who owes something has paid. All ticked means `SETTLED`; untick one and it's `LOCKED` again. Unlocking is refused while anyone is ticked, so paid amounts can't move.
- **The e2e test runs it end to end:** register, make a bill, two guests join and claim, lock, then mark payments against a real Postgres, including the `401`, `403`, `400`, `404` and `409` answers.

## KAN-48: PayNow QR on the guest's Summary tab

- **The API makes the QR text, the web app only draws it:** the share summary gives each guest a `paynowPayload` for exactly their total, built by the KAN-47 code. The page draws it with `qrcode.react` on a white square, because cameras need dark squares on white.
- **One method per view:** `SummaryService.forBill` (owner) and `forGuest` (share link) replaced one method with a `{ withPaynow }` flag. With the flag, TypeScript could only say "it might have PayNow fields", so code using them didn't compile; two methods give each caller an exact type.
- **No QR until the bill is locked:** while friends are still tapping, an amount can change, so someone could pay the wrong amount. The card says "Your PayNow QR appears here once Chee locks the bill" until then.
- **Paying from the same phone:** you can't scan your own screen, so there are Copy number and Copy amount buttons (`navigator.clipboard`), which show what was copied.
- **Checked the checksum a second way:** Python's `binascii.crc_hqx(data, 0xFFFF)` is the same CRC-16/CCITT-FALSE, and it agreed with ours on a generated payload.

## KAN-47: PayNow QR payload

- **A PayNow QR is just text:** the SGQR (EMVCo) format is a list of fields, each written as `ID` (2 digits) + `LENGTH` (2 digits) + `VALUE`. For example `5802SG` is field 58 (country), 2 characters long, value `SG`. Field 26 holds more fields inside it: `SG.PAYNOW`, proxy type `0` (a mobile number), the number, and `0` so the amount can't be changed in the bank app.
- **The checksum:** the payload ends with `6304` and a CRC-16/CCITT-FALSE of everything before it, including the `6304` itself. A bank app rejects a QR whose CRC doesn't match, so a typo can't send money to the wrong place. The standard test value `crc16("123456789") = 29B1` proves the function is right.
- **Lengths count characters:** a name like "José" or an emoji would make the length field wrong for a bank app that counts bytes, so names and references are cut down to plain ASCII and 25 characters.
- **Amounts stay integers:** 720 cents becomes `"7.20"` by dividing and padding, never `7.2` floating point, like `formatCents`.
- **Tested by reading it back:** the tests parse the payload into fields again and check each one, instead of comparing one long string. `src/payments` now has its own 90% coverage gate.

## KAN-46: installable app (PWA)

- **What makes a website installable:** a manifest (name, `display: standalone`, icons 192, 512 and a maskable one) and a service worker. `vite-plugin-pwa` writes both at build time; `pwa.config.ts` holds the settings and `pwa.config.test.ts` checks them, including that each icon file really has the size the manifest claims.
- **iPhones mostly ignore the manifest:** Safari takes the home screen icon from `<link rel="apple-touch-icon">` (180×180, no transparent corners, iOS rounds them) and full-screen mode from `apple-mobile-web-app-capable`, so `index.html` needs those as well.
- **Never cache money:** only the app shell (HTML, JS, CSS, icons, fonts) is precached. There are no runtime caching rules, and `/api/` is on the navigation fallback's deny list, so bills always come from the server. Checked in headless Edge: offline, `/bills/abc` still opens the app, but `fetch('/api/health')` fails instead of returning an old answer.
- **New deploys reach the phone:** `registerType: 'autoUpdate'` makes the new service worker take over and reload the page. That only works if the browser asks the server for `sw.js` and `index.html` every time, so the Caddyfile sends `Cache-Control: no-cache` for every file except the hashed ones in `/assets`, which can be cached because their names change with each build.
- **The Claude desktop browser pane can't register service workers** ("unknown error when fetching the script", and the request never reaches the server). The same build works in Edge, so the check was done there.
- **Icons:** drawn from the same shapes and colours as `favicon.svg` (two half circles on the dark background), at 192, 512, 512 maskable (full bleed, logo inside the safe zone) and 180 for iOS.

## KAN-41: security scans (CodeQL, npm audit, Trivy)

- **Three scans, three different views:** CodeQL reads our code, `npm audit` reads our dependency list, Trivy reads the finished Docker image. On the first run `npm audit` said **0**, but Trivy found **7 HIGH** CVEs, because it also sees what we never listed ourselves.
- **Where the findings were:** 6 were in the npm CLI that comes inside the `node:24-slim` base image (`brace-expansion`, `undici`). The API doesn't use npm at runtime (`node dist/main.js`), so the runtime stage now deletes it. Rescan: **0 HIGH**. The one in the web image is inside Caddy's binary, and no Caddy release has the fix yet.
- **Accepting a risk, then fixing it:** I first accepted the Caddy CVE in `.trivyignore.yaml` with a reason and `expired_at: 2026-12-31`. Three days later the PR's `trivy web` check went red on a _new_ CVE in the same binary (Go's standard library 1.27.3), published after my local scan. Caddy's builder image already had the fixed Go, so the web Dockerfile now rebuilds the same Caddy release (v2.11.9) with `xcaddy`, Go 1.27.4 and `x/net` v0.62.0: 0 HIGH with an empty ignore list. Copying the new binary drops the official image's `setcap` (permission for ports 80/443 without root), so it is set again; without it the non-root container couldn't start on 443.
- **The scanner was the attack:** in March 2026 attackers moved 76 of `trivy-action`'s 77 version tags to code that stole CI secrets (CVE-2026-33634). So the action is pinned to a full commit SHA (v0.36.0, released after the clean-up), and the Trivy binary to `v0.76.2`. A tag can be moved; a SHA can't.
- **A full disk breaks things in strange ways:** my laptop's C: drive filled up, so Docker went read-only in the middle of a scan and left Trivy's database corrupted (a `SIGBUS` crash, not a "disk full" message). Clearing Docker's 11 GB build cache and deleting the broken cache fixed it.
- **Removing a file in a later layer doesn't shrink the image:** the base layer still holds npm, so the image is the same size. What changes is what a running container can use, and what the scanner reports.
- **CodeQL scans the workflows too** (`actions` language), e.g. for untrusted PR text used inside a `run:` line.
- **The new scanner checked my own pipeline:** on the first PR, CodeQL's `actions` scan raised 3 findings: a job with no permission limit, and Docker's actions on movable tags. GitHub offered one-click fix commits, but I fixed them myself: one workflow-wide `permissions: contents: read`, and every third-party action (13 places in 2 workflows) pinned to the commit its tag pointed to, so nothing changed in what runs.
- **An advisory can appear between two runs:** three days after the first clean `npm audit`, a HIGH advisory for `effect` (inside the Prisma CLI) was published, so the gate would have failed the PR with no code change. Prisma pins `effect` exactly, and an npm `overrides` entry left the install broken, so I accepted it through audit-ci's allowlist with a reason and a review date. Scans are about time, not just code.

## KAN-45: the summary screen and the Lock button

- **What it shows:** one card per person with what they had, their part of the service charge and GST, and their total in big numbers, plus a "Paid" badge. At the bottom: the bill's subtotal, service, GST and total, and "Everyone's totals add up to $35.37 ✓".
- **Two ways in, one view:** the owner opens `/bills/:id/summary` (from "See summary" on the share screen, or from My bills once a bill is locked); a friend taps the Summary tab on the share link. Both draw the same `SummaryView`, so they can never disagree.
- **No money maths in the page again:** every number comes from `GET .../summary`, which the tested split engine works out. The page only adds up the people's totals to show the check, and shows a warning if they ever don't match.
- **Unclaimed items:** if nobody tapped an item, the API gives it to the owner. The screen says so in amber ("$16.00 unclaimed, assigned to you"), and the owner's card lists it as "(unclaimed)", so nobody pays for something without being told.
- **Lock and unlock:** Lock bill (`POST /bills/:id/lock`) makes the split final and friends can no longer tap. Unlock is a quiet glass button, because the main white button is for the next step forward. Any refusal from the API (`409`) is shown as a sentence.
- **Tried for real:** I made the brief's bill on my laptop through the real API (Chee, Ali, Ben and Dan) and the screen showed Chee $7.20, Ali $8.99, Ben $9.59, Dan $9.59 = $35.37, the ticket's acceptance test. Lock then Unlock worked, and a fifth friend saw the same breakdown on the Summary tab with their own card as "You".
- **Testing by role and name:** each card is an `<article>` named after the person, so a test can say "in Ben's card, find $9.59". It is also how a screen reader announces the cards.

## KAN-44 (part 2): adjust how a shared item is split, and join with a code

- **Adjust split sheet:** on an item I share with someone, "Adjust split" opens a sheet with four modes: Equal, % , Shares (2 : 1) and Exact amounts. It tells you while you type whether it adds up ("90%, need 100%", "$15.00, need $16.00"), and **Save is disabled until it does**.
- **The rules are one plain function:** `checkSplit(mode, ids, values, itemCents)` in `bills/split.ts` returns either the entries to send or a message. No React in it, so 16 quick unit tests cover every rule, and the sheet only draws what it returns.
- **Reused maths:** "70" → `7000` basis points and "10" → `1000` cents both go through the same text-to-hundredths helper from KAN-43, so there is still no decimal maths in the browser.
- **Checked twice on purpose:** the browser check is for speed and kindness; the API checks the same rules again (`SetSplitDto`, then the split engine), because anyone can send a request without my page.
- **Tried for real (the ticket's 70/30 test):** Ali and Dan share a $16.00 Tiger Beer. After 70/30, Ali owed `$21.48` and Dan `$5.23`, and the four people's totals still added up to the bill's `$33.25` exactly. The cents are right because the tested split engine (largest remainder) does the rounding, not the page.
- **Join with a code:** `/join` takes the 5-character code, asks `GET /join/:code` for the share token and opens the same `/s/:token` page as the link. The code's shape is checked first, so a typo doesn't use up the rate limit.
- **A new button broke an old test:** the test looked for a button named `/Tiger Beer/`, and "Adjust split of Tiger Beer" now matched too. Finding things by their accessible name means names must be distinct, which is also what a screen-reader user needs.

## KAN-40: three deploys failed because the server's disk was full

- **What happened:** on 16 Nov, three merges in a row (#70, #73, #71) built and pushed their images, then failed in the deploy step with `no space left on device` while pulling. The first one was only a test-library update, so it was not the code.
- **The site stayed up:** the script stops at the pull (`set -e`), before it touches the running containers, so the previous release (KAN-43) kept serving. `/api/health` answered `ok` the whole time. A failed deploy is red in GitHub but invisible to users.
- **The cause was my cleanup line:** `docker image prune -f` only removes **untagged** images. Every release leaves three images tagged with its commit SHA (`web`, `api`, `migrate`), and those were never removed. After about 30 deploys the 20 GB disk was full.
- **The fix:** `docker image prune -af` removes every image that no container is using. It runs before the pull (so a full disk heals itself on the next deploy) and again after a healthy release. The running release is "in use", so it is always kept for a rollback.
- **Now visible:** each deploy prints the disk use (`disk: 6.2G used, 13G free (33%)`), so a disk filling up shows in the log long before it fails.
- **No SSH needed to fix it:** the deploy job copies `deploy.sh` to the server before running it, so merging the fix was the repair.
- **Lesson:** a cleanup step that "runs without errors" is not the same as one that cleans up. I should have checked the disk after a few deploys.

## KAN-44 (part 1): share a bill, friends tap their items

- **The flow:** Check items → **Share** (QR code, 5-character join code, copy link, who has joined) → a friend opens `/s/:token`, types a name once, and taps what they had. "My total so far" stays at the bottom of their screen.
- **Two kinds of token, kept apart:** the owner has a login token (`Authorization: Bearer`); a friend has a guest token for one bill, sent as `X-Guest-Token` and kept in `localStorage` under that bill's share token. A `401` on a guest call only forgets the guest token and asks the name again; it must never log the owner out when both are on the same phone. A test covers exactly that.
- **Polling, not WebSockets:** `usePolling` loads now and every 5 seconds, and clears its timer when the page is left. It is 8 lines, and its test uses fake timers to "wait" 5 seconds instantly. WebSockets stay a stretch item.
- **Still no money maths in the browser:** the friend's total comes from `GET /share/:token/summary`, worked out by the tested split engine.
- **The QR code is an SVG** drawn by `qrcode.react` from the link. It sits on a white card, because phone cameras need dark squares on a light background, even in a dark app.
- **Use what the phone has:** `navigator.clipboard` copies the link, and the "Share…" button (the phone's own share sheet) only appears where `navigator.share` exists.
- **A test that failed for the right reason to check:** a missing fake reply for `GET /me` made the app log the owner out in the test. The app was right; my test setup was wrong.
- **Tried for real** against the local API: joined as "Ali", tapped Laksa and Tiger Beer → `$26.71` (8.50 + 16.00, + 9% GST); a second friend joining appeared on the owner's Share screen within 6 seconds.
- **Not built yet (part 2):** the "Adjust split" sheet (equal / % / shares / exact) for shared items, and typing a join code on the home page.

## KAN-43 follow-up: one look for every screen

- **Design tokens:** every colour is a name in `apps/web/src/index.css` (`@theme`), and screens only use the names (`text-muted`, `bg-raised`). I changed the whole look three times in one day (green pills → my site's look → dark glass, then new colours) and no screen file needed a new colour; no test changed either, because the tests find things by label and role, not by style.
- **Written down first:** `docs/ui-reference.md` says what I saw in the design I liked and what I took from it; `docs/ui-design.md` is the rules (colours, glass, shapes, building blocks, a checklist). Only the style is borrowed: no photos, icons, text or layouts from the reference.
- **Frosted glass is three lines of CSS:** a see-through white background, a 1px light border and `backdrop-filter: blur()`. The glow is one fixed `body::before` with three `radial-gradient`s, so no screen has to draw it.
- **Shared pieces instead of copied classes:** `row`, `Initial`, `SectionLabel`, `primaryButton` and friends live in `components/Page.tsx`, so bills and items look the same because they are the same code.
- **An SVG cuts off what leaves its box:** the logo's halves slide apart, and the edges were clipped until the SVG got `overflow: visible` and the mark was made a little smaller.
- **Self-hosted font:** Plus Jakarta Sans comes from an npm package and is built into the app, so there is no request to Google and it works offline.
- **Respecting the phone:** the page rise-in and the logo movement switch off under `prefers-reduced-motion`.

## KAN-43: Scan a receipt and check the items

- **The flow:** My bills → New bill (a name) → Add items (photo, or "Type it in") → Check items (fix items, service charge and GST, see the totals).
- **Dollars to cents without decimals:** `parseDollars("12.5")` gives `1250` by splitting the text at the dot and padding the cents ("5" → "50"). `19.99 * 100` in JavaScript is `1998.9999999999998`, so the maths never touches a decimal number. Percent to basis points is the same function ("7.5" → 750).
- **Totals come from the API:** every change (add, edit, delete, charges) is saved at once and the bill is loaded again. The page never works out service or GST itself, so the money maths still has one home (`SplitModule`).
- **The camera is one line of HTML:** `<input type="file" accept="image/*" capture="environment">` opens the back camera on a phone and a file picker on a laptop. No camera library.
- **Photos are shrunk first:** iPhone photos can be over the API's 5 MB limit. The photo is drawn onto a canvas at most 1600 px wide and sent as a JPEG. A 1.5 MB test photo became 363 KB.
- **The AI's answer is still checked by a person:** after a scan the items are put on the (open, unshared) bill and shown on Check items. The receipt's printed total travels with them: "Receipt says $35.37 ✓" when our total matches, a warning when it doesn't.
- **A test caught a timing mistake of mine:** I changed the fake API's next answer before the page had loaded the first one, so the page started with the wrong bill. Wait for the screen first, then set up the next answer.
- **jsdom limits:** it has no canvas and no `URL.createObjectURL`, so the tests swap `shrinkImage` for a pass-through and `image.ts` is the one file not covered by tests (web coverage is still 96%). I tried it in a real browser instead.
- **Tried for real** against the local API with the fake receipt reader: scan → 3 items, total $35.37 ✓; changing Laksa to $8.50 showed the warning; switching service charge off gave $33.25.

## KAN-42: Login and register screens

- **One API client:** every call goes through `api()` in `apps/web/src/api/client.ts`. It adds `/api`, the `Bearer` token and JSON, and turns the API's error JSON into a sentence (`displayName must be…` → `Name must be…`, a list of problems → one per line, `429` → "Too many tries").
- **Staying logged in:** the token is kept in `localStorage`. On a refresh, `AuthProvider` asks `GET /me` who it belongs to; an expired token gets `401`, which clears it and shows Log in. The page waits ("Loading…") instead of flashing Log in first.
- **Same rules on both sides:** the forms check the `RegisterDto` rules before sending (email, 8–128 characters, `+65` mobile starting with 8 or 9), so most mistakes show at once. The API still checks, because the browser can't be trusted.
- **Same address in dev and production:** Vite sends `/api` to `localhost:3000` in development, like Caddy does in production, so there is no CORS and no different URL to configure.
- **Tests that act like a person:** Testing Library types into fields found by their label and clicks buttons by name, with `fetch` replaced by a fake API. Finding fields by label also proves the labels are linked to the inputs (screen readers need that). The web app now has a 90% coverage gate too (100% lines).
- **iPhone details:** inputs use 16px text, because iPhone Safari zooms in on anything smaller, and buttons are 48px tall.
- **Tried for real:** against the local API, registering landed on My bills, a refresh kept me logged in, a wrong password showed "Invalid email or password", and Log out went back to Log in with the token gone.
- **Lint warning avoided:** React's fast refresh wants files to export only components, so `useAuth` lives in `context.ts`, not next to `AuthProvider`.

## KAN-50: Sprint 1 evidence, measured again

- **Direct push to `main` (KAN-17):** an empty commit pushed straight to `main` was rejected with `GH013`: "Changes must be made through a pull request" and "7 of 7 required status checks are expected". The rule applies to me as the repo owner too. The test commit never reached GitHub.
- **npm cache (KAN-16), same commit twice:** the first CI run after Dependabot changed `package-lock.json` logged `npm cache is not found`. Re-running the same commit restored the 151 MB cache that the first run had saved.

  |                                    | No cache   | Cache     |
  | ---------------------------------- | ---------- | --------- |
  | `npm ci`, average of the 5 jobs    | 11 s       | 9 s       |
  | `setup-node` (downloads the cache) | 1 s        | 4 s       |
  | Whole CI run                       | 2 min 42 s | 2 min 7 s |

- **The npm cache barely helps:** downloading 151 MB of cache takes about as long as `npm ci` saves, because GitHub's runners download from npm very fast. The run was 35 s faster, but that came from `docker-build` (158 s → 121 s, Docker's layer cache), not npm. `docker-build` is the slowest job, so that is the cache that matters.
- **Docs had drifted:** the report notes still said 5 required checks, "branch must be up to date" (the ruleset doesn't require it) and "under 1 minute" per run.

## KAN-39: HTTPS with Caddy

- **Why now:** the iPhone camera and installing the PWA only work over HTTPS, and logins were travelling as plain HTTP.
- **Free name:** DuckDNS points `splitlah.duckdns.org` at the server. Port 443 was already open; `curl` said "connection refused" (open but nothing listening) rather than timing out (blocked).
- **One container, not two:** the web image is Caddy with the React build inside. It serves the files and passes `/api/*` to `api:3000`. The API no longer has a public port.
- **`infra/` is excluded from Docker builds** (`.dockerignore`), so the Caddyfile lives next to the web Dockerfile. That also means CI builds and checks it on every PR.
- **Not root:** the official Caddy image runs as root. A `caddy` user still works on ports 80 and 443, because the Caddy binary already has permission to use low ports; it only needs to own `/data`, where the certificate is kept.
- **Health check moved inside:** `deploy.sh` now asks the API inside its container, so a slow Let's Encrypt certificate can't roll back a good release. The deploy job then checks `https://` from the internet, which also proves the certificate.
- **A rate-limit hole closed:** the API trusts one proxy for the client's IP (`trust proxy 1`). With no proxy in front, a client could send a fake `X-Forwarded-For` and dodge the per-IP limits. I tested Caddy locally: a faked `6.6.6.6` reached the API as the real address.
- **Tested before merging:** the real API image behind the web image answered `{"status":"ok","db":"up"}` through Caddy, app paths like `/bills/abc` load the React app, and the Caddyfile validates.
- **Windows line endings:** my Python edits saved files with CRLF, which Prettier flagged. Git would have fixed them on commit, but I converted them back to LF.
- **It went live first time:** the deploy passed, and Let's Encrypt issued the certificate in seconds (valid to 8 Feb 2027, renewed automatically). `http://` answers `308` to `https://`, and port 3000 doesn't answer from the internet.
- **Certificate kept across a restart:** after `docker compose restart` the site served the same certificate (same serial), so the `caddy-data` volume works and a restart won't use up Let's Encrypt's limits.
- **iPhone check:** Safari opens the app with no "Not Secure" warning. Recent iOS Safari doesn't show a padlock any more; it only warns when a page isn't secure.

## KAN-76: Expenses API

- **No migration needed:** the `Expense` table, its `(userId, spentAt)` index and the unique `(userId, billId)` were already designed in KAN-70.
- **Tests first:** I wrote the month, summary, service and controller tests before the code and saw all 4 files fail (the code didn't exist), then wrote the code until all 28 passed.
- **Singapore months:** a month is `[1st 00:00 SGT, next 1st 00:00 SGT)`, stored as UTC instants. 11pm on 30 Nov SGT is 3pm UTC, still November; 00:30 on 1 Dec SGT is 30 Nov in UTC but counts as December. Unit and e2e tests check both sides of midnight.
- **Summary maths as a pure function:** `summarise()` has no database, so a fast-check property test can throw hundreds of random months at it and check that the category totals always equal the month total.
- **Someone else's expense is 404, not 403:** every query includes `userId`, so another user's expense looks exactly like a missing one and IDs can't be probed. The e2e test checks list, summary, edit and delete as user B.
- **Paging that never repeats:** ordered by `spentAt`, then `createdAt`, then `id`, so two expenses at the same time always come in the same order and pages don't overlap.
- **Bill shares stay honest:** a `BILL_SHARE`'s amount, merchant and date come from the bill (`409` to change them), but the category and note are personal.
- **Small trap:** a DTO unit test crashed with `Reflect.getMetadata is not a function`. `@Type(() => Number)` needs `reflect-metadata`, which Nest loads at startup but a test that imports the DTO alone doesn't.

## KAN-75: Moving the database to Amazon RDS

- **Private by design:** public access is off, so the endpoint resolves to a private `172.31.x.x` address. The `rds-sg` rule allows port 5432 only from the server's **security group**, not an IP. From my laptop the port is unreachable; from the server `psql` connects.
- **My rule pointed at the wrong group:** the first connection from the server timed out. A timeout (not "refused") means a firewall is dropping packets. In CloudShell, `describe-instances` showed the server uses `sg-0f8e…` while `rds-sg` allowed `sg-0bf1…`. Fixing the source fixed it at once.
- **Two users:** the master user only creates things; the API logs in as `app`, which owns just the `splitlah` database. Postgres 16+ needed `GRANT app TO postgres` before `CREATE DATABASE … OWNER app`.
- **TLS that is actually checked:** the `pg` driver treats `sslmode=require` as verify-full and warns that `pg` 9 will change that. Node doesn't trust Amazon's RDS certificate authority, so Amazon's public certificates are mounted into the containers with `NODE_EXTRA_CA_CERTS`. The first test failed only at the password step, which proved the network and certificate were already fine.
- **Tested before switching:** a one-off API container connected with `pg`, and the `migrate` container created all 3 migrations on RDS, while the live site still used the old database. The real switch is the merge: the deploy uses the new compose file (no `db` service).
- **SSH from outside home:** my public IP changed between two attempts minutes apart, so a single-IP rule kept locking me out. A temporary `/24` rule for that network let me in; SSH still accepts only my key.

## KAN-33: Reading receipts with Gemini

- **One zod schema, used twice:** it is sent to Gemini as the required JSON shape, and the same schema checks the answer before anything is used. Bad answers (prices in dollars, negative prices, unknown category, not JSON) become a clear `422`, never bad data.
- **Friendly failures:** Gemini `429` → our `429` "free limit reached"; any other error or a 60 s timeout → `503`. Every message says the items can be added by hand. Our route allows 5 uploads a minute, so users meet our message before Google's.
- **Draft, not saved:** I first saved the items straight onto the bill, then found `docs/api.md` already said scanned items are a draft the owner checks first. I followed the contract; the code got simpler too.
- **Measure, don't guess:** Gemini 3.8 Flash took 100 s on one receipt. Lowering "thinking" wasn't enough. I timed three models and moved to 3.5 Flash-Lite (about 2 s, 500 free a day vs 20). Because the model is a setting, each switch was one line. I also found `gemini-3.5-flash` is counted as "3.6 Flash" in AI Studio.
- **Real receipts found real bugs:** a McDonald's discount, NTUC "2 FOR $7.95" deals ($3.975 isn't a whole cent) and GST-inclusive totals each broke the sums. Fixed with prompt rules and by comparing the total with the items' sum. Final: 35/35 items, 5/5 totals ([ocr-accuracy.md](ocr-accuracy.md)).
- **Tests never call Gemini:** unit tests pass a pretend `generate` function; the e2e test overrides `OCR_SERVICE` with the Fake even if a developer's `.env` says `gemini`. One unit test uses a real saved NTUC answer.
- **Choices left out:** no `sharp` resizing (its Linux binary is an optional dependency, and our image installs with `--omit=optional`); the photo isn't stored (privacy, no storage cost), so `ReceiptImage.storagePath` became nullable with an additive migration.
- **Windows blocked oxlint:** after a clean `npm ci`, Smart App Control refused oxlint's native file ("An Application Control policy has blocked this file"). Not a code problem: I ran the same oxlint version in a Linux container (0 warnings), which is what CI does anyway.

## KAN-31: OCR behind an interface (dependency injection)

- **A token, not a class:** TypeScript interfaces disappear when compiled, so Nest can't inject `OcrService` by its type. A `Symbol('OCR_SERVICE')` token stands for "whatever reads receipts", and consumers use `@Inject(OCR_SERVICE)`.
- **`useFactory` picks the implementation:** `OcrModule` runs `createOcrService(process.env.OCR_PROVIDER)` once at startup. Unset means `fake`, so the live server (which has no `OCR_PROVIDER`) keeps working.
- **Fail fast:** `gemini` and `tesseract` are valid names but not built yet, and a typo like `gemnii` is invalid; both stop the app at startup with a clear message instead of failing on the first receipt.
- **The Fake returns the brief's bill** in integer cents (items add up to the subtotal, total $35.37), and a fresh copy each time so one caller can't change the next result.
- **Proved the swap in tests:** a pretend consumer gets the Fake through config, and `overrideProvider(OCR_SERVICE).useValue(stub)` replaces it without touching the consumer. `src/ocr` is now in the 90% coverage gate.
- **Small trap:** `npx prettier --check .` inside `apps/api` flagged 212 generated Prisma files, because the root `.prettierignore` only applies when run from the root. CI runs `npx prettier --check apps/api` from the root, which passes.

## KAN-37: Continuous deployment to EC2

- **What happens on every merge to `main`:** build and push both images → the `deploy` job logs in to AWS with **OIDC** → opens port 22 for its own IP only → SSHes in as `deploy` → `deploy.sh` pulls the new images, runs the migrations, starts the API and waits for `/api/health` → closes port 22 again (always) → checks `/api/health` from the internet.
- **OIDC instead of AWS keys:** GitHub gives the job a signed token; AWS checks it against the role's trust policy, which accepts only this repo's `production` environment. No AWS access key exists anywhere. My first trust-policy edit kept the wizard's `repo:…:*` next to the new value, which would have let any workflow in the repo use the role; it now matches only `…:environment:production`.
- **Least privilege:** the role can only add or remove inbound rules on the one security group, nothing else in the account.
- **Pinned server fingerprint:** `EC2_KNOWN_HOSTS` holds the server's SSH fingerprint, so the job refuses to talk to an impostor server.
- **A separate `migrate` image:** the slim runtime image has no Prisma CLI (KAN-36), so a second image (`--target migrate`) runs `prisma migrate deploy` once per release. Running it twice says `No pending migrations`, so a re-run is safe.
- **Rollback proven before the first real deploy:** I ran `deploy.sh` locally with a good release, then a broken one whose API never answers. It failed the health check, rolled back to the good release by itself and exited with an error. Re-running the same release was also safe (idempotent).
- **Secrets made on the server:** `.env` was generated with `openssl rand` directly on the server (`umask 077`, readable only by `deploy`), so the database password and `JWT_SECRET` never passed through my laptop, GitHub or chat.
- **Temporary choices:** Postgres runs in Docker on the same server until RDS (KAN-75), and the API is on plain HTTP port 80 until Caddy and HTTPS (KAN-39).
- **The first real deploy failed at the AWS login:** `Not authorized to perform sts:AssumeRoleWithWebIdentity`, although the trust policy looked right. Instead of guessing, I added a step that prints the token's claims (masking the token). GitHub's `sub` was `repo:cheewei0123@210798904/ay2626s2-cicdp-ChongCheeWei@1437996139:environment:production`: it includes the account and repo **numeric IDs**, which most guides (and the ticket) don't show. GitHub does this so a renamed or re-registered name can't inherit cloud access. Updating the trust policy to that exact value fixed it; re-running the failed job deployed without a new merge.
- **It went live:** `http://47.129.169.19/api/health` → `{"status":"ok","db":"up"}`. **Merge → live in about 2½ minutes** (build 1m 4s + deploy 1m 35s), well under the ticket's 10 minutes. Jira's KAN-37 shows the deployment to production.
- **Port 22 open only during the deploy:** a screenshot taken mid-deploy shows the runner's `/32` rule; refreshed after the run, only my home IP is left. The rule's description now records the run ID, so a leftover could be traced.
- **Re-deploy is safe:** running the workflow again by hand gave `No pending migrations to apply` and `Healthy`.
- **Polish after the first deploy:** the migrate image now has OpenSSL (Prisma had warned it "may not work" without it), and the health check stays quiet while the API is still starting (`curl: (56) Connection reset by peer` on the first try was just the API booting).

## KAN-35: EC2 server with Docker

- **Account safety first:** MFA on the root account, and a monthly budget alert (US$10, because the public IPv4 alone is about US$3.60/month, so US$1 would fire every month).
- **Wrong region at first:** my first instance got an IP starting `52.87.`, which is N. Virginia, not Singapore. I terminated it and relaunched in `ap-southeast-1`: users are in Singapore, and RDS must be in the same region as the server. Key pairs and security groups are per region, so both had to be made again.
- **`setup-server.sh` instead of clicking around:** Docker from the official repository, a `deploy` user with Docker but no sudo, only the GitHub Actions key allowed for `deploy`, SSH keys-only with no root login, automatic security updates, and 1 GB swap. It is in git, checked with ShellCheck, and can be run again on a new server.
- **A separate key for GitHub Actions:** if it leaks, deleting one line on the server cuts it off without touching my own key. The ticket's test passed: `ssh deploy@<server> docker ps` with that key.
- **Windows mistakes:** my instructions assumed `C:\Users\chong\.ssh` existed. It didn't, so `ssh-keygen` failed and `Move-Item` turned the `.pem` file itself into a file called `.ssh`. Fixed by renaming it back and creating the folder. Windows SSH also refuses a `.pem` that other accounts can read, so `icacls` locks it to my user.
- **Locked out by my own firewall:** SSH is allowed only from my IP, but my VPN (Cloudflare, `104.28.x.x`) kept changing address, and "My IP" had saved an IPv6 address. `scp` timed out. Turning the VPN off, deleting the IPv6 rule and adding my home IPv4 `/32` fixed it. AWS won't change an existing rule from IPv6 to IPv4.
- **Open problem for KAN-37:** GitHub Actions runners use thousands of changing IPs, so with SSH limited to my IP the deploy job can't reach the server yet.

## KAN-36: Docker image and GHCR

- **Multi-stage Dockerfile:** `build` installs everything and compiles; `prod-deps` installs only what the running app needs; `runtime` starts from a clean `node:24-slim` and copies just `node_modules` and `dist/`. Compilers, TypeScript, tests and source code never reach the final image.
- **Image sizes (report table):** naive single-stage `node:24` with everything: **2.7 GB, runs as root**. Multi-stage: **505 MB, runs as `node`** (`docker run … whoami` → `node`). About 5× smaller and not root.
- **`--omit=dev` was not enough:** the first multi-stage image was 829 MB because the Prisma CLI and TypeScript were still inside. The lockfile marks them `devOptional`: dev dependencies for me, but _optional peer_ dependencies of `@prisma/client`, so npm keeps them. `--omit=peer` changed nothing; `--omit=optional` removed them.
- **A real bug the slimming exposed:** after `--omit=optional` the container crashed with `Cannot find package 'dotenv'`. The API uses dotenv **18**, but Prisma's tools use dotenv **17**, so npm put 17 in the root `node_modules` and 18 in `apps/api/node_modules`. My Dockerfile only copied the root folder, so the first image had been **running with the wrong dotenv (17)** and only worked by luck. Copying `apps/api/node_modules` too fixed it, and the crash made the bug visible.
- **Smoke test inside the container:** health 200, register, login, create a bill, add an item, summary `$1.80` (150 + 15 + 15). Docker's `HEALTHCHECK` reported `healthy`.
- **`GET /api/health`:** runs `SELECT 1`, answers `503` if the database is down, and has `@SkipThrottle()` because Docker calls it every 15 seconds.
- **CI and CD:** every PR builds the image (`docker-build`, no push), so a broken Dockerfile can't merge. On merge to `main`, `deploy.yml` pushes it to GHCR tagged with the **commit SHA** (exactly which code is inside) and `latest`. It logs in with the run's own `GITHUB_TOKEN`, so no personal token is stored anywhere.
- **No secrets in images:** `.dockerignore` excludes every `.env`; `DATABASE_URL` and `JWT_SECRET` are passed in when the container starts.
- Dependabot now also watches the Docker base image (KAN-22 said to add this once Dockerfiles exist).

## KAN-34: API e2e tests in CI

- **New CI job `test-e2e`:** GitHub starts a **Postgres 18 service container** (an empty database just for this run), waits until `pg_isready` says it accepts connections, runs `prisma migrate deploy`, then the 48 e2e tests. Before this, the e2e tests only ran on my laptop.
- **Test pyramid (report section c):** unit tests check the logic in milliseconds with fake dependencies; e2e tests check the real routes, guards, validation and database together; browser tests (Playwright) come later.
- **Migrations from zero:** I simulated CI locally with a brand-new Postgres 18 on another port. Both migrations applied in order on the empty database and all 48 tests passed. My normal local database could hide a broken migration because it was built up step by step.
- **No secrets in the workflow:** `JWT_SECRET` is generated with `openssl rand` in each run and written to `$GITHUB_ENV`. The database password only exists inside the throwaway container.
- **Why not truncate tables between tests (as the ticket suggested):** Vitest runs test files in parallel, so truncating would delete another file's data in the middle of its test. Instead every test file creates its own users with a unique email and deletes them in `afterAll`. The cleanup check found 0 test users left.
- **Proof that e2e catches real bugs:** I stopped the largest-remainder step from handing out leftover cents. 5 e2e tests failed, e.g. `expected { Chee: 719 } to equal { Chee: 720 }` and `expected 3535 to be 3537`. Restored afterwards.
- **Postgres 18, not 16 (ticket):** CI now matches local Docker and RDS. No Fake OCR override yet because OCR is KAN-31.
- **Proved in CI too:** a throwaway PR (#45) with the broken engine turned `test-api` and `test-e2e` red, both marked **Required**, and greyed out **Squash and merge**. `lint`, type-check and `build` stayed green, which shows why tests are needed: a maths bug compiles and lints fine. Closed, not merged.
- **New check = new ruleset entry:** the first `test-e2e` run had no **Required** badge until I added it to the `protect-main` ruleset. A new job does not block merges on its own.

## KAN-29: Summary (what everyone owes)

- **The brief's example works end to end:** the owner and 3 guests claim through the real API and database, and `GET /api/bills/:id/summary` answers **Chee $7.20, Ali $8.99, Ben $9.59, Dan $9.59 = $35.37**, with `unclaimedCents: 0`.
- **Module boundaries + DI:** the split engine now lives in its own `SplitModule`, which exports `SplitService`. `BillsModule` imports it, and `SummaryService` gets `SplitService` through its constructor. The engine still knows nothing about Prisma: `SummaryService` turns database rows into plain numbers, calls the engine, and adds names, `"$7.20"` text and paid flags.
- **A gap I found:** unclaimed items go to the owner, but the owner was never a participant on their own bill (only guests join). Now the owner's participant is created the first time it is needed, linked by `userId`, and the owner can claim items with `POST /api/bills/:id/claims`.
- **A bug the e2e test caught:** the numbers were right but the order was not. The owner's participant was created after the guests joined, so it came last in join order, except on the very first call, where I had put it first. Now the owner is always first.
- **Guests get one extra field:** `GET /api/share/:token/summary` adds the owner's PayNow number so guests can pay them back. The test checks the owner's email still never appears.

## KAN-74: Split modes (equal, shares, percent, exact)

- **One idea for all four modes:** each mode just gives every person a **weight** on the item: EQUAL → 1, SHARES → their shares, PERCENT → their `percentBp`, EXACT → their `exactCents`. The KAN-20 largest-remainder engine already splits by weights, so the money maths did not change, and the receipt total still always matches. (It works like the strategy pattern: one `weightOf` choice per mode, same algorithm after it.)
- **TDD again:** 17 tests first against an empty stub (red commit), then the code (green commit). The ticket's numbers are tests: 70% / 30% of $16 → **1120 / 480**, 2:1 of $9 → **600 / 300**, whole bill still **3537**.
- **The property test found an edge case on its first run:** an **unclaimed** EXACT item "added up to $0.00, need $0.01" and threw. Unclaimed items go to the owner, so the mode rules only apply once someone has claimed the item. Added a regression test.
- **Two layers of validation:** the `@ValidSplitEntries` custom class-validator rule rejects bad percentages in the DTO (`400` before the controller). EXACT amounts need the item's price, so the service checks them with the same `checkItemSplit()` the engine uses. The error messages tell the user what to fix: `Percentages add up to 90%, need 100%`.
- **Saved all at once:** the item's mode and every person's value are written in one `prisma.$transaction`, so a half-saved split (mode changed, values not) can't happen.
- **Rule I had to decide:** if someone joins or leaves a PERCENT or EXACT item, the old values no longer add up, so the item goes back to EQUAL. Who may change a split: the owner, or anyone who claimed that item.
- Older items without a mode still split by shares, so nothing made before KAN-74 changed.
- **What the red run taught me:** against the empty stub, 19 tests failed but the **2 property tests passed**. The stub still split everything by shares, and the receipt total still added up. So property tests prove the split **never loses or invents a cent**, but not that each person gets the **right** amount; the example tests (70/30 → 1120/480) prove that. I need both.
- **Pushing red and green together hid the red in CI:** CI only tests the newest commit of a push, so GitHub showed no ❌ on the red commit. The red is shown by the local run (`kan-74-red.png`). Next time, push the red commit alone first so the PR itself shows it failing.

## KAN-28: Guests claim items, owner locks the bill

- **Two guards, two questions:** on claim routes, `ShareTokenGuard` answers "which bill?" (from the link) and `GuestTokenGuard` answers "which guest?" (from the `X-Guest-Token` header). The guest token must be for **this** bill (`403` otherwise), so a guest of one bill cannot claim on another, and nobody can claim as someone else.
- **No duplicates by design:** claiming uses `upsert` on the unique `(itemId, participantId)` index: update if it exists, otherwise create. Tapping the same item twice changes the shares instead of adding a row. The e2e test checks the database still has 2 claims, not 3.
- **Item must belong to the bill:** the claim looks up the item by `{ id, billId }`, so an item ID from another bill is `404`.
- **Lock and unlock:** owner only (`BillOwnerGuard`). Lock is `OPEN → LOCKED`, unlock is `LOCKED → OPEN`; anything else is `409`. While locked, claims and items answer `409` because they share one `assertOpen()` helper (moved to `bill-status.ts` so owners and guests use the same rule).
- **50/50 check without the summary endpoint:** the ticket asks for "summary splits it 50/50", but the summary is KAN-29. The e2e test reads the two real claims back from the database and runs them through the KAN-20 `SplitService`: Tiger × 2 ($16) becomes **959 / 959**, the same as the brief.
- **Lint caught leftover code:** moving `assertOpen` out of `BillsService` left an unused `ConflictException` import. `--deny-warnings` failed lint until I removed it.

## KAN-27: Share link, join code and guest join

- **Two ways in, no sign-up:** the share link (`/api/share/:token`, a 22-character random token) or the 5-character join code (`GET /api/join/:code` → share token). `ShareTokenGuard` finds the bill from the token (`404` if wrong) and puts it on `req.bill`, just like `BillOwnerGuard` does for owners.
- **Security trade-off (report section d):** anyone with the link can see the bill. That is the point (friends join without accounts), so the token must be unguessable: 16 random bytes is about 3.4 × 10³⁸ possibilities. Join codes are much shorter (32⁵ ≈ 33 million), so `GET /join/:code` is limited to 20 requests a minute, and a code stops working once the bill is settled.
- **Guest view hides private data:** `ShareService.view` uses a `select` that lists every allowed field. Nothing else (owner email, owner ID, participants' user IDs) can come out, even if columns are added later. The e2e test checks the response text never contains the owner's email.
- **Guest token:** joining returns a JWT `{ sub: participantId, billId, typ: "guest" }` that lasts 24 hours. It uses the same secret as login tokens, so `JwtAuthGuard` now rejects anything with `typ: "guest"`; otherwise a guest token would pass as a login. A test proves `/api/me` answers `401`.
- **Repeated names:** `Ben` then `Ben` becomes `Ben (2)` (case-insensitive), so the summary can tell them apart.
- **Migration:** added `Bill.joinCode` as **nullable** so it only adds a column (additive, safe to roll back). `prisma migrate dev` refused to run in a non-interactive shell, so I generated the SQL with `prisma migrate diff` and applied it with `prisma migrate deploy`, the same command production will use.
- **Join code clashes:** 33 million codes means two bills can rarely get the same one. The unique index rejects it (`P2002`), and `create` tries again with a new code, up to 5 times.
- **My own maths slip:** I expected 720 cents for a bill with only Chicken Rice. 720 is Chee's _share_ of the full bill; Chicken Rice alone is 600 + 60 + 59 = 719. The test caught my wrong number.

## KAN-16 follow-up: type-check and build in CI

- **The gap:** CI ran lint and tests but never compiled the code. In KAN-26 a type error passed every test and was only caught because I ran `nest build` by hand.
- **Why tests don't catch it:** Vitest strips the types and runs the JavaScript, so a wrong type never stops a test.
- **Why the build alone isn't enough:** `nest build` uses `tsconfig.build.json`, which skips test files. I proved it by putting `const broken: number = 'not a number'` in a test file: tests passed, build passed, only `tsc --noEmit` failed (`TS2322`).
- **Fix:** the `lint api` and `lint web` jobs now also run `npm run typecheck` (every file, tests included) and `npm run build`. The job names stay the same because the `protect-main` ruleset requires those exact names.
- **Proved the block:** a throwaway PR with a `debugger;` line turned `lint api` red and greyed out **Squash and merge**. Closed, not merged, branch deleted.
- **Don't trust the badge alone:** on an all-green PR, GitHub only showed the **Required** badge next to `gitleaks`, so I thought the other four were no longer required. The ruleset listed all 5, and on the red PR all 5 showed **Required**. A failing PR is the real test.
- **`fail-fast`:** when `lint api` failed, GitHub **cancelled** `lint web`, because jobs in a matrix stop together by default. It saves minutes, but hides whether web would also have failed.

## KAN-26: BillOwnerGuard

- **What it does:** `@UseGuards(JwtAuthGuard, BillOwnerGuard)` on every route with a bill ID. Guards run in that order: first "is there a valid login?" (`401`), then "is this bill yours?". The owner guard loads the bill (`404` if missing), compares `ownerId` with `req.user.id` (`403` if different), then puts the bill on `req.bill`.
- **`@OwnedBill()`** reads `req.bill` in the controller, so the route gets the checked bill without loading it again, and the service no longer needs its own "is it mine?" query.
- **Why a guard instead of checking in the service:** the rule lives in one place and runs before the pipe and the controller. Lock, summary and payments (KAN-28, 29) just add the same decorator.
- **Changed my mind from KAN-25:** I had returned `404` for someone else's bill to hide that it exists. The ticket asks for `403`, and bill IDs are random 25-character strings, so there is nothing to probe. Now: missing → `404`, not yours → `403`.
- **The build caught a bug the tests missed:** Express 5 types a route param as `string | string[]`. Vitest does not type-check, so all tests passed, but `nest build` failed. CI does not run the build yet, so this would have reached `main`.
- **Supertest gotcha:** I created 5 requests in an array before sending them. Supertest starts and stops a temporary server for each request, so the later ones failed with `Cannot read properties of null (reading 'address')`. Creating each request inside a function, only when it is sent, fixed it.

## KAN-25: Bills and items

- **Routes:** `POST/GET /api/bills`, `GET/PATCH /api/bills/:id`, and `POST/PATCH/DELETE /api/bills/:billId/items[/:itemId]`, all behind `JwtAuthGuard`.
- **DTOs do the checking:** `CreateItemDto` says the price is a whole number of cents from 1 to 10,000,000. `ValidationPipe` turns `0`, `-100` and `1.5` into a `400` before the controller runs, so the service never sees a bad price.
- **Owner only, without a guard yet:** every query includes `ownerId`, so another user's bill is simply "not found" (`404`). Answering `404` instead of `403` also hides whether that bill ID exists. A proper `BillOwnerGuard` comes in KAN-26.
- **Item belongs to the bill:** item updates use `where: { id: itemId, billId }`. An item from another bill makes Prisma throw `P2025`, which the exception filter from KAN-30 already turns into `404`, so no extra code was needed.
- **Locked bills:** items and bill details can only change while the bill is `OPEN`; otherwise `409`.
- **Totals on every bill:** `billTotals()` from KAN-19 adds `{ subtotalCents, serviceCents, gstCents, totalCents, total: "$35.37" }`. `formatCents()` builds the text with integers only (`3537` → `$35.37`), never `35.37` as a float.
- **Share token:** 16 random bytes as base64url (22 characters), made when the bill is created.
- **Refactor:** the `trim` helper had been copied into 3 DTO files, and its "not text" branch was untested in each copy, so coverage fell below 90%. Moving it to `src/common/transforms.ts` with one test fixed both.
- Docker Desktop was closed again, so the first e2e run failed with `500`. Start Docker before `npm run test:e2e`.

## KAN-24: Register and login with JWT

- **Flow:** register or log in → the API returns a **JWT** (a signed token that says "this is user u1" and expires in 1 hour). The app sends it back as `Authorization: Bearer <token>`. `JwtAuthGuard` checks the signature and expiry, then puts `{ id, email }` on the request; `@CurrentUser()` reads it in the controller.
- **Passwords:** stored as a salted **scrypt** hash (`scrypt$<salt>$<hash>`), never as text. scrypt is built into Node, so no `bcrypt` package with native builds on Windows and in Docker. Checking uses `timingSafeEqual`, so the time taken does not hint how close a guess was.
- **Not leaking who has an account:** a wrong password and an unknown email get the same `401`, and an unknown email still runs a hash check so both take about the same time.
- **DTO + ValidationPipe:** `RegisterDto` says what a valid body is (`@IsEmail`, `@MinLength(8)`, `+65` mobile). The global `ValidationPipe` rejects bad bodies with `400` and a list of messages before the controller runs, and `forbidNonWhitelisted` rejects extra fields (e.g. `isAdmin: true`).
- **DI in tests:** the `AuthService` test gives Nest a fake `PrismaService` (`{ provide: PrismaService, useValue: fake }`), so it tests the logic without a database. The e2e test then uses the real database: register → login → `GET /api/me` = 200 with the token, 401 without.
- **Why not Passport:** the ticket suggested `@nestjs/passport` + `passport-jwt`. A 20-line guard with `@nestjs/jwt` does the same and I can explain every line.
- **Mistake:** the e2e tests failed with 500 because Docker Desktop was closed, so there was no database. The error came from Prisma, not my code.
- The app refuses to start without `JWT_SECRET` (`requireEnv`). The real value is only in the gitignored `.env`; `.env.example` has it empty.
- Email verification (`/auth/verify-email`) is a separate ticket.

## KAN-30: Cross-cutting pieces (middleware, interceptor, filter, throttler)

- **Every request now goes through 4 NestJS pieces**, all in `apps/api/src/common/`:
  - `RequestIdMiddleware` gives each request an ID (`x-request-id`), sent back in the response and written in its log line. A client's own ID is kept only if it is short and safe; one with a line break is replaced, so nobody can fake a log line.
  - `LoggingInterceptor` logs one JSON line per successful request: `{"requestId":"…","method":"GET","path":"/api","status":200,"ms":2}`.
  - `AllExceptionsFilter` turns every error into `{ statusCode, error, message, requestId, timestamp }`. Prisma's duplicate error (`P2002`) becomes `409` and not-found (`P2025`) becomes `404`. Any other error becomes `500 Internal server error` with no details; the stack trace only goes to the log, and not in production.
  - `ThrottlerGuard` allows 100 requests per minute per IP; request 101 gets `429`.
- Plus `helmet` (safe headers), CORS limited to the web app, and every route under `/api`.
- **Who logs what:** the interceptor logs successes and the filter logs errors, because only the filter knows the final status (a Prisma error becomes 409, not 500).
- **One setup function** (`configureApp`) is used by both `main.ts` and the e2e tests, so the tests run the same app as production.
- **My CORS test was wrong at first:** I expected no `Access-Control-Allow-Origin` header for another site. With one fixed origin the header always names our web app; the **browser** then blocks the other site because the names don't match.
- Paths outside `/api` (e.g. `GET /`) still get Express's HTML 404. In production Caddy only sends `/api` to the API, so users never see it.
- Per-route limits (10/min on receipt upload, 20/min on guest join) get added with `@Throttle` when those endpoints exist.
- `src/common` joined the coverage gate (90% lines and branches); it is at 100% lines.

## KAN-22: Gitleaks and Dependabot

- **Shift-left security:** Gitleaks runs on every PR and scans the full git history (`fetch-depth: 0`), so a key that was committed and later deleted is still caught.
- Before adding it to CI I ran it locally in Docker (`ghcr.io/gitleaks/gitleaks`). It found one **false positive**: the README that Nest CLI generated has a badge link with a made-up example token (`abc123def456`). Old commits cannot be changed on a protected `main`, so that one finding is listed by fingerprint in `.gitleaksignore`, and the boilerplate README was replaced with a short project one.
- **Fake-key test, two layers:** a made-up AWS key never reached GitHub. **GitHub push protection** (free on public repos) rejected the push with `GH013`, because it knows AWS's key format. A generic made-up API key got past push protection, but the required `gitleaks` check failed on the PR and the merge button was disabled. Push protection only knows provider formats; Gitleaks has more rules.
- `gitleaks-action` is free for personal GitHub accounts; only organisation accounts need a licence key.
- **Dependabot** checks npm packages and GitHub Actions weekly. Minor and patch updates are grouped into one PR so CI is not flooded. npm workspaces share one lockfile at the repo root, so Dependabot scans from `/` rather than each app folder.
- **First Dependabot run:** 5 PRs within 35 minutes. One went red: Dependabot bumped `@vitest/coverage-v8` to v5 in its own PR while `vitest` stayed on v4, and the two must match (`Cannot find package '@vitest/coverage-v8'`). CI blocked it from reaching `main`. Fixed by grouping `vitest` + `@vitest/*` (and `prisma` + `@prisma/*`, which have the same rule) so they always update in one PR.
- **The group still only bumped `vitest`** (PR #18 said "1 update"), leaving `@vitest/coverage-v8` on 4. Dependabot does not always pull every group member along, so I upgraded both to 5 by hand in one PR and closed #18.
- **That PR still failed `test-api` in CI with the same error, but passed on my laptop.** CI runs a clean `npm ci`; my laptop still had the old folders. After `npm ci` locally I got the same error. The lockfile had put `vitest` in the root `node_modules` but `@vitest/coverage-v8` inside `apps/api/node_modules`, and the root `vitest` cannot see inside `apps/api`. Reinstalling coverage-v8 moved it to the root. Lesson: run `npm ci`, not just `npm install`, before trusting a dependency change. Vitest 5's coverage table hides files that are 100% covered, so `src/split` no longer appears in it; the 90% gate still fails when the split tests are removed.

## KAN-21: Edge cases, property tests and the coverage gate

- **The property test found a real bug in KAN-20.** fast-check generated 1,000 random bills; on one large bill with many different share totals, the LCM scale made the numbers bigger than JavaScript can hold exactly (about 9 × 10¹⁵), and the split crashed. My own 5,000-bill stress test had missed it because its bills were smaller.
- **Fix:** do the weights and the largest-remainder maths with `BigInt` (whole numbers with no size limit). Results go back to normal numbers, which is safe because no person's share can be bigger than the bill. A fixed regression test (6 dishes with share totals 7, 8, 9, 10, 11, 13) keeps the bug from coming back.
- **Property tests vs example tests:** example tests check answers I already know (720 / 899 / 959 / 959). Property tests check rules that must hold for _any_ bill (totals add up, nothing negative), and the tool searches for a bill that breaks them.
- **Coverage gate:** `vitest.config.ts` requires 90% lines and branches on `src/split`; CI runs `npm run test:cov`, so a PR that drops below fails. Checked by hiding the split tests: `test:cov` failed with `Coverage for lines (14.45%) does not meet "src/split/**" threshold (90%)`.
- The ticket said `jest.config.ts`; this project uses Vitest (from Nest v12), so the threshold lives in `vitest.config.ts`.
- Split coverage is now 100% (35 tests).

## KAN-20: Per-person split with largest remainder

- **The problem:** splitting cents by ratio gives fractions (Chee's exact share is 719.39¢). Rounding everyone normally can make the total 1¢ off the receipt.
- **Largest remainder:** floor everyone's exact share, count the cents left over, then give one extra cent each to the people with the biggest fractional parts. Ties go to the smaller participant ID so the answer never changes between runs.
- **Worked example (the brief):** exact totals 719.39 / 899.24 / 959.19 / 959.19 → floors add to 3536 → 1¢ left → Chee has the largest fraction (.39) → **720 / 899 / 959 / 959 = 3537**.
- **No floats:** each person's exact subtotal is stored as a whole number by multiplying by the least common multiple of every item's total shares (Tiger shared 1:1 → ×2). Fractions are then compared as integer remainders.
- **Design choice:** the ticket rounds each person's total once. I round items, service and GST separately with the same helper, so each person's three parts always add up to their total and none can come out as -1¢. On the brief's bill both methods give the same answer.
- Unclaimed items go to the bill owner and are reported as `unclaimedCents` so the app can warn.
- Checked with 21 unit tests plus a throwaway stress test of 5,000 random bills: every total matched the receipt.

## KAN-19: SG service charge then GST (TDD)

- **TDD:** wrote 10 tests first against a stub that throws, saw all 10 fail (red), then wrote the code until they passed (green). The two commits are kept separate on the PR so the order is visible.
- **Order matters:** service is charged on the subtotal, then GST on subtotal + service. On the brief's bill (2950) that gives 295 + 292 = 3537. Charging GST on the subtotal alone would give 266 and the wrong total.
- **Rounding with integers only:** `Math.floor((amount * bp + 5000) / 10000)` rounds half up without floats. Adding half of 10000 before dividing is what turns `floor` into "round half up". Example: 3245 × 900 = 2,920,500 → 292.
- **Guard clauses:** negative or decimal inputs throw a `RangeError` so a bad value can never quietly produce a wrong bill.
- Split code coverage: 100% lines and branches.

## KAN-18: Prisma + Postgres in Docker

- Docker Desktop needed the Windows "Virtual Machine Platform" feature. `wsl --install` failed with `Forbidden (403)` because it tries to download Ubuntu; `wsl --install --no-distribution` (or enabling the feature with `dism`) fixed it.
- Port 5432 was already used by a Postgres 18 I had installed on Windows, so the Docker database runs on 5433.
- Prisma 7 is different from older tutorials: it needs `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`), and `migrate dev` no longer generates the client. I added `postinstall: prisma generate` so `npm ci` (and CI) always generates it.
- Local (Docker) and production (Amazon RDS) both use Postgres 18 so behaviour matches (dev/prod parity).

## KAN-17: Protect main

- The ruleset was set up correctly but **not enforced**: GitHub only enforces rulesets on private repos with a paid plan. A direct push to `main` went through. After making the repo public, the same push was rejected with `GH013: Changes must be made through a pull request`.
- Auto-delete of merged branches only applies to PRs merged after the setting is turned on.

## KAN-16: CI workflow

- oxlint reports some rules (e.g. `no-debugger`) as **warnings**, which exit 0, so a PR with lint problems would still be green. Found this by adding a `debugger;` on purpose. Fixed with `oxlint --deny-warnings`.
- A PR follows its branch: pushing a fix to the same branch updates the open PR and re-runs CI.

## KAN-15: Monorepo

- Nest CLI v12 and the current Vite template set up **oxlint and Vitest** instead of ESLint and Jest. I kept the generated tools.
- `README.md` had been saved as UTF-16, so git treated it as a binary file. Converted it to UTF-8; VS Code kept showing it garbled until the tab was reopened.
- Squash merge uses the PR title as the commit message, so the PR title must start with the Jira key.

## KAN-13: NestJS building blocks

How the main NestJS ideas map to code, using files already in this repo where possible.

- **Module:** a box that groups related code and says what it needs. `AppModule` lists its controller, its service and `imports: [PrismaModule]`. Later each feature (bills, auth, split) gets its own module.
- **Provider:** any class Nest can create and hand to others, marked with `@Injectable()`. `AppService`, `PrismaService` and `SplitService` are providers.
- **Dependency injection (DI):** a class asks for what it needs in its constructor, and Nest creates it and passes it in. `AppController` has `constructor(private readonly appService: AppService)`; it never writes `new AppService()`.
  - Why it helps testing: in a test, `Test.createTestingModule` can swap the real provider for a fake one. Later, `OcrService` and `EmailService` use this, so CI never calls Gemini or sends real emails.
- **`@Global()` module:** `PrismaModule` is global, so any module can inject `PrismaService` without importing `PrismaModule` again.
- **Controller:** maps a URL to a method. `@Controller()` + `@Get()` on `getHello()` answers `GET /`. Controllers stay thin and call a service.
- **Pipe:** checks or converts input **before** the controller runs. Example: a global `ValidationPipe` with a DTO such as `class CreateBillDto { @IsString() title: string }` returns `400 Bad Request` automatically if `title` is missing.
- **Guard:** decides **yes or no** to a request. Example: `JwtAuthGuard` returns `false` (→ `401`/`403`) when there is no valid token.
- **Guard vs middleware:** middleware runs first and knows only the raw request (good for adding a request ID or logging). A guard runs later and knows **which controller method** is about to run, so it can check rules for that route (e.g. "only the bill owner").
- **Interceptor:** wraps the controller call, so it runs code **before and after**. Example: record the time before, then log `GET /bills 12ms` after.
- **Order of one request:** middleware → guard → interceptor (before) → pipe → controller → service → interceptor (after) → exception filter (if something threw).

### Compared with Express

- Express: I wire everything by hand (`app.use(...)`, `app.get('/', handler)`, `require` the service). NestJS: decorators like `@Controller`, `@Get` and `@Injectable` do the wiring, and Nest builds the objects.
- Express has one idea for everything (middleware). NestJS splits it into guards, pipes and interceptors, each with a single job, so it is clearer where a rule lives.
- More files and more structure at the start, but tests are easier because dependencies can be swapped out.
