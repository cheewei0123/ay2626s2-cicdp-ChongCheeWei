# Evaluation: what worked, what didn't, and what next

An honest look at the project at the feature freeze (22 Nov 2026). Every point comes from something measured or something that happened; the evidence is linked. Report section 12 is written from this file.

## Objectives

| Objective                     | Result                                                                                                                                       | Evidence                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Split correct to the cent     | Met. The brief's bill gives 720, 899, 959, 959 = 3,537 cents; shares add up to the total on 1,000 random bills every run.                    | `apps/api/src/split`, [data-model.md](data-model.md)             |
| Pipeline that blocks bad work | Met. 13 required checks; a lint error, a broken split engine and a fake key were all blocked; a direct push to `main` is rejected.           | `kan-16-lint-red-blocked.png`, `kan-34-broken-split-blocked.png` |
| Automatic, safe deploy        | Met. Merge to live in 2½–3 minutes with migrations, a health check and rollback; a failed deploy (full disk) left the site up.               | [pipeline.md](pipeline.md), `kan-40-deploy-disk-full-steps.png`  |
| Secure by default             | Met. No AWS key stored (OIDC); SSH open only during a deploy; private RDS; 8 HIGH image and 3 CodeQL findings fixed.                         | [security.md](security.md)                                       |
| Usable on an iPhone           | Met. HTTPS with no warning; installed on the home screen; opens full-screen.                                                                 | `kan-39-iphone-https.png`, `kan-46-iphone-*.png`                 |
| Pay back by PayNow            | Built and live; **not checked** with a friend scanning the QR in a real banking app (the rehearsal for it was dropped on 23 Nov).            | KAN-61 (dropped)                                                 |
| Email verification            | Met. Switched on 22 Nov: registering on the live site sent a real email through Gmail SMTP, and its link verified the account on the iPhone. | `kan-77-verification-email.png`                                  |

## Strengths of NestJS, seen in this project

- **Swapping a dependency is one line.** The receipt reader is an interface behind a token. Tests and CI use a Fake; production uses Gemini; `OCR_PROVIDER` picks one (ADR 003). The email sender later used the same pattern. Without DI, every test would call Gemini, which is slow, costs quota and answers slightly differently each time.
- **Rules live in one place.** `BillOwnerGuard` is the only code that decides who may change a bill, the `ValidationPipe` rejects bad input before a controller runs, and one exception filter gives every error the same shape with a request ID.
- **The structure scales with the code.** 10 feature modules (auth, bills, split, ocr, receipts, expenses, payments, email, health, prisma), each with its controller, service and tests, so a feature is easy to find and to review in one PR.
- **Types catch mistakes before tests run.** Prisma generates types from the schema; the type check in CI caught an Express 5 route-parameter type that every test had missed.

## Limitations I hit

- **Boilerplate.** Marking a person as paid (KAN-49) was 16 files and 638 lines: a module, controller, service, DTO, guard wiring, unit and e2e tests and docs. In Express the endpoint alone would be a handful of lines; the extra files paid off in tests, but a small feature is never small.
- **Decorator "magic" fails at run time, not compile time.** An interface can't be injected (it disappears when compiled), a provider must be exported from its module before another module can use it, and a DTO test crashed because `reflect-metadata` wasn't loaded. All three compiled fine and only failed when Nest started.
- **Steeper learning curve.** The first week was a learning spike just to map Nest's ideas onto the Express I knew, and most tutorials were for older versions (Jest and ESLint instead of Nest 12's Vitest and oxlint).
- **Heavier than it needs to be for a small API.** The API image is 123 MB and the container used 92–119 MiB of memory under a light load test, on a server with 909 MiB. I didn't build the same API in Express, so I can't give a fair comparison, and it runs as a long-lived container, so I didn't measure serverless cold starts.

## Bottlenecks in my system

- **One server.** Everything runs on one EC2 t3.micro: a crash, a reboot or a bad deploy is downtime, and a t3.micro's CPU credits run out under long heavy load.
- **Memory, not CPU.** At 10 users the API used 2–3% CPU, but about 500 MiB of the 909 MiB was in use and 108 MiB was already in swap (k6, 22 Nov).
- **Receipt reading is bound by Gemini,** not my server: each scan waits about 2 s, is limited to 5 a minute per IP, and the free tier has a daily quota.
- **Polling instead of push.** The guest, share and summary screens ask the API every 5 seconds. Simple and reliable, but 10 friends on one bill make about 2 requests a second even when nothing changes.
- **Rate-limit counters live in the API's memory,** so a second copy of the API would let each copy allow its own 20 join-code guesses.

## Trade-offs I made

- **PWA, not a native app:** no App Store, one codebase, installed from Safari. The cost is the browser's limits: the camera opens through a file input (`capture`), not a custom camera screen, and I didn't build notifications.
- **Guests join by link or code, without an account:** friends can split in seconds, which is the point of the app. The risk is that anyone with the code can join, so the code is random, 5 characters, and guesses are limited to 20 a minute per IP (checked by k6 on the live site).
- **RDS instead of Postgres on the server:** a managed, private database with backups, at the cost of setup time (security groups) and a second free-tier service to watch.
- **Docker Compose on one EC2 instead of ECS or Kubernetes:** cheap and easy to explain, but no second instance and no rolling deploy.
- **Scrum alone:** sprints, a board and retros kept the work visible, but one person plays every role, so reviews are my own plus the 13 checks.

## When to use NestJS, and when not

- **Use it** for an API with many business rules and roles that must stay testable as it grows, or a team that needs one shared structure, as in SplitLah, where owners, guests and anonymous users may do different things.
- **Avoid it** for a tiny API, a one-off script or a single serverless function, where plain Express, Fastify or a function handler is less code and starts faster.

## What I would do next

- **Features:** upload and decode a PayNow QR instead of typing the number; live updates over WebSockets; discounts; groups and friends lists; one colour per category in the expenses chart.
- **Architecture:** a staging environment that every merge deploys to before production; the AWS setup (EC2, RDS, security groups, IAM) as Terraform instead of console clicks; Redis for rate-limit counters so the API can run as more than one copy.
- **Scalability:** two or more API containers behind a load balancer, or ECS; a bigger instance or more memory; RDS Multi-AZ so the database survives an AWS zone failure.

## Conclusion

The release criteria in report section 2.5 are met, apart from two checks by hand: paying with a real banking app, and email verification needing the SMTP password on the server. The main lessons: measure instead of trusting old numbers (the deploy had quietly tripled in time), let the pipeline enforce the Definition of Done, and keep money in integers.
