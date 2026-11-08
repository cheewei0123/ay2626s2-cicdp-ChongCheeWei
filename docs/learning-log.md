# Learning log

Short notes on what I learned and what went wrong, newest first. Used as evidence for the report.

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
