# REST API contract

Every endpoint the PWA calls, agreed before building, so the backend (Sprint 2) and frontend (Sprint 3) use the same shapes. Later this is generated live with `@nestjs/swagger` at `/api/docs`.

## Basics

- **Base path:** `/api`. JSON in and out, except uploads (`multipart/form-data`).
- **Money:** always integer **cents**, plus a display string. Example: `{ "totalCents": 1250, "total": "$12.50" }`.
- **Rates:** basis points (`1000` = 10%). Percent splits too (`10000` = 100%).
- **Dates:** ISO 8601 (`2026-11-05T09:30:00.000Z`). Month filters use `YYYY-MM`.
- **IDs:** strings.

## Who can call it

| Level      | Means                                                       | Sent as                                      |
| ---------- | ----------------------------------------------------------- | -------------------------------------------- |
| `public`   | Anyone                                                      | nothing                                      |
| `JWT`      | Logged in                                                   | `Authorization: Bearer <token>`              |
| `verified` | Logged in **and** email verified (`EmailVerifiedGuard`)     | same                                         |
| `owner`    | Logged in **and** owns this bill (`BillOwnerGuard`)         | same                                         |
| `guest`    | Has the bill's share link, plus a guest token after joining | `:token` in the URL + `X-Guest-Token` header |

A guest gets the guest token when they join (`POST /share/:token/participants`). It identifies which participant they are, so they can only change their own claims. No sign-up needed.

- The guest token is a JWT `{ sub: participantId, billId, typ: "guest" }` that lasts 24 hours. The app keeps it in the browser.
- It is signed with the same secret as login tokens, so login routes check `typ` and refuse it (`401 A guest token cannot be used to log in`).

## Errors

Every error uses one format, from a global exception filter:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["percentBp values must add up to 10000"],
  "requestId": "8f3c1a2e",
  "timestamp": "2026-11-05T09:30:00.000Z"
}
```

| Code  | When                                                                              |
| ----- | --------------------------------------------------------------------------------- |
| `400` | Body or query fails validation (DTO), e.g. percent split not 100%, negative price |
| `401` | No token, or token invalid or expired                                             |
| `403` | Logged in but not allowed: email not verified, not the bill owner, not your claim |
| `404` | Bill, item, share token or expense does not exist                                 |
| `409` | Conflict: email already registered, bill is locked, claim already exists          |
| `413` | Uploaded image too large                                                          |
| `429` | Too many requests (rate limit, e.g. login, email resend, join codes)              |

Every endpoint can also return `500` for unexpected errors (same format).

## Auth

| Method | Path                        | Who      | Request body                                      | Response                                                       | Errors        |
| ------ | --------------------------- | -------- | ------------------------------------------------- | -------------------------------------------------------------- | ------------- |
| POST   | `/auth/register`            | `public` | `{ email, password, displayName, paynowMobile? }` | `201 { user, accessToken }`                                    | 400, 409, 429 |
| POST   | `/auth/login`               | `public` | `{ email, password }`                             | `200 { user, accessToken }` or `200 { mfaRequired, mfaToken }` | 400, 401, 429 |
| POST   | `/auth/mfa`                 | `public` | `{ mfaToken, code }`                              | `200 { user, accessToken }`                                    | 400, 401, 429 |
| POST   | `/auth/logout`              | `JWT`    | none                                              | `204`                                                          | 401, 429      |
| POST   | `/auth/verify-email`        | `public` | `{ token }` (from the email link)                 | `204`                                                          | 400, 429      |
| POST   | `/auth/resend-verification` | `JWT`    | none                                              | `204`                                                          | 401, 409, 429 |
| POST   | `/auth/forgot-password`     | `public` | `{ email }`                                       | `204` (always)                                                 | 400, 429      |
| POST   | `/auth/reset-password`      | `public` | `{ token, password }` (from the email link)       | `204`                                                          | 400, 429      |

- Emails are trimmed and lower-cased, so `Chee@Example.com` and `chee@example.com` are one account.
- Passwords: 8 to 128 characters. Only a salted scrypt hash is stored.
- A wrong password and an unknown email get the same `401 Invalid email or password`, so nobody can find out which emails have accounts.
- The `accessToken` is a JWT that lasts **14 days** (KAN-97). Send it as `Authorization: Bearer <token>`.
- **Sessions (KAN-97):** every login (and register) adds a `Session` row that ends 14 days later, and the token carries its id as `sid`. `JwtAuthGuard` checks that session on every request (one primary-key lookup), so `POST /auth/logout` ends this login at once on the server while other devices stay logged in. A token without `sid` (the old 1-hour kind) is refused, and run-out sessions are deleted at the user's next login.
- Auth routes are limited to 10 requests per minute per IP.
- **Email verification (KAN-77):** registering emails a link to `APP_URL/verify?token=…`. The token is 32 random bytes; only its SHA-256 hash is stored. It expires after 24 hours and works once. Unknown, used and expired tokens all get the same `400`.
- Until verified, `POST /bills` and every `/expenses` route answer `403 Verify your email first…`. Reading your bills, guests and share links are not affected. Verifying takes effect at once: `EmailVerifiedGuard` reads the database, not the login token.
- `resend-verification` is limited to 3 an hour, so it can't flood an inbox, and answers `409` once verified.
- If the email fails to send, the account is still created (the error is logged) and "Send again" can retry.
- `EMAIL_PROVIDER=fake` (tests, CI, local) logs the link instead of sending it; `smtp` sends through Gmail with an app password.
- **Forgot and reset password (KAN-90):** `forgot-password` always answers `204`, so it never shows which emails have accounts; the email goes out in the background so the timing doesn't either. It is limited to 5 an hour per IP. The link `APP_URL/reset-password?token=…` works once and expires after 30 minutes; only its SHA-256 hash is stored. Resetting also marks the email verified (the link proved it) and uses up every other reset link for the account.
- **Ending old logins:** each user has a `sessionVersion`, copied into the login token as `ver`. Resetting or changing the password raises it, and `JwtAuthGuard` refuses a token whose `ver` is out of date (`401 Your session has ended. Log in again.`), so every other device is logged out at once. With sessions (KAN-97) this still ends every session, because each session's token carries the old `ver`.
- **Two-step login (KAN-92):** when it is on, a right password does not log in. `/auth/login` answers `{ mfaRequired: true, mfaToken }` instead: a JWT with `typ: 'mfa'` that lasts 5 minutes and is refused by every other route. `POST /auth/mfa` with that token and a code finishes the login and returns `{ user, accessToken }` like `/auth/login`. The code is the 6 digits from the authenticator app (TOTP, RFC 6238, 30-second steps, one step either side allowed for a slow phone clock) or one of the backup codes (`xxxx-xxxx`, any case). A code that was already used, or an older one, is refused, so a code seen over someone's shoulder can't be replayed. 5 tries a minute; a wrong or used code is `401 That code is not right`, a token past 5 minutes is `401 This login took too long. Start again.`

## Profile

| Method | Path                 | Who   | Request body                       | Response                        | Errors                  |
| ------ | -------------------- | ----- | ---------------------------------- | ------------------------------- | ----------------------- |
| GET    | `/me`                | `JWT` | none                               | `200 user`                      | 401                     |
| PATCH  | `/me`                | `JWT` | `{ displayName? }`                 | `200 user`                      | 400, 401, 404           |
| POST   | `/me/password`       | `JWT` | `{ currentPassword, newPassword }` | `200 { user, accessToken }`     | 400, 401, 403, 429      |
| GET    | `/me/mfa`            | `JWT` | none                               | `200 { on, backupCodesLeft }`   | 401                     |
| POST   | `/me/mfa/setup`      | `JWT` | `{ password }`                     | `200 { secret, otpauthUrl }`    | 400, 401, 403, 409, 429 |
| POST   | `/me/mfa/enable`     | `JWT` | `{ code }`                         | `200 { backupCodes }`           | 400, 401, 409, 429      |
| POST   | `/me/mfa/disable`    | `JWT` | `{ password, code }`               | `200 user`                      | 400, 401, 403, 429      |
| GET    | `/me/phone/methods`  | `JWT` | none                               | `200 { telegram, sms }`         | 401                     |
| POST   | `/me/phone/telegram` | `JWT` | `{ phone }`                        | `200 { phone, expiresAt, url }` | 400, 401, 409, 429, 503 |
| POST   | `/me/phone`          | `JWT` | `{ phone }`                        | `200 { phone, expiresAt }`      | 400, 401, 409, 429, 503 |
| POST   | `/me/phone/verify`   | `JWT` | `{ code }`                         | `200 user`                      | 400, 401, 429           |
| DELETE | `/me/phone`          | `JWT` | none                               | `200 user`                      | 401                     |

`paynowMobile` must be a Singapore mobile number (`+65` and 8 digits starting with 8 or 9).

Built in KAN-81 (slimmed):

- `PATCH /me` changes only the name: `displayName` is trimmed and must be 1 to 50 characters. Any other field (such as `email`, or `paynowMobile` since KAN-91) gives `400`.
- **Checking the PayNow number by SMS (KAN-91).** `user` now includes `phoneVerifiedAt` (`null` = never checked). A number typed in at sign-up is kept but not checked.
  - `POST /me/phone` texts a 6-digit code to `phone`. Only the code's SHA-256 hash is stored (salted with the user id); it lasts 10 minutes and is used up after 5 wrong tries. Asking again replaces the code. Limits, because each SMS costs money: 3 calls per 10 minutes per IP, and one SMS a minute per account (`429 Wait N seconds…`). `409` if that number is already the checked one; `503` if the SMS could not be sent (the code is then forgotten, so they can try again at once).
  - `POST /me/phone/verify` with the right code moves the number into `paynowMobile` and sets `phoneVerifiedAt`. Until then the old number (if any) stays as it was. A wrong code says how many tries are left (10 calls a minute).
  - `DELETE /me/phone` removes the number and any code waiting for one.
  - **Or through Telegram, for free.** `POST /me/phone/telegram` gives a one-time `url` (`https://t.me/<bot>?start=<token>`, 10 minutes; only the token's SHA-256 is stored; 5 calls per 10 minutes per IP). In Telegram the user presses Start and then _Share my phone number_; the bot checks the shared contact is their own (`contact.user_id` = sender) and is the same number, then sets `paynowMobile` and `phoneVerifiedAt` like a right SMS code. A leaked link is no use to anyone else: their Telegram number would not match. Starting one way cancels a waiting check of the other way. `503` if the bot is not set up.
  - `GET /me/phone/methods` says which ways work on this server: `telegram` when the bot is set up, `sms` when texts really go out (`SMS_PROVIDER=sns`) or the server is not the live one. The Profile screen only offers those.
  - The guest view of a bill only shows the owner's number, and only builds PayNow QRs, when `phoneVerifiedAt` is set, so a typo can't send a friend's money to a stranger.
  - `SMS_PROVIDER=fake` (tests, CI, local) logs the code; `sns` sends it through Amazon SNS with the EC2 instance's IAM role (no key stored), see [infra.md](infra.md).
- The response is the same safe user as `GET /me`, never the password hash. `404` if the account behind the token no longer exists.
- Cut to fit the deadline: uploading and decoding a PayNow QR (`POST /me/paynow-qr`) and the phone field. The number alone is enough to build each friend's QR (KAN-48).
- `POST /me/password` (KAN-90) needs the current password (`403 Your current password is wrong`, 5 tries a minute; it was `401` until KAN-92, which the web app treats as "logged out"). It logs out every other device and returns a fresh token, so this one stays logged in.
- **Two-step login (KAN-92):** `setup` needs the password again (`403` if wrong) and returns a new secret and an `otpauth://` link for the QR; nothing is on yet. `enable` with the first right code turns it on and returns 10 backup codes, shown this once: only `sha256(userId:code)` is kept and each works once. `disable` needs the password and a code (`403` if either is wrong). `409` if it is already on (setup, enable). The secret is stored sealed with AES-256-GCM, using a key derived from `JWT_SECRET` (HKDF), so a database leak alone does not give the secrets away. Each route is limited to 5 calls a minute.
- **`403`, not `401`, for a wrong password or code while logged in:** the web app logs out on any `401`, so a typo must not end the session.

## Bills (owner)

| Method | Path                                 | Who        | Request body                                                                 | Response                                                              | Errors                                      |
| ------ | ------------------------------------ | ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| POST   | `/bills`                             | `verified` | `{ title, merchant?, date?, serviceBp?, gstBp? }`                            | `201 bill` (with `shareToken` and `joinCode`)                         | 400, 401, 403                               |
| GET    | `/bills`                             | `JWT`      | none                                                                         | `200 bill[]` (mine, newest first)                                     | 401                                         |
| GET    | `/bills/:id`                         | `owner`    | none                                                                         | `200 bill` with items, participants, claims                           | 401, 403, 404                               |
| PATCH  | `/bills/:id`                         | `owner`    | `{ title?, merchant?, date?, serviceBp?, gstBp? }`                           | `200 bill`                                                            | 400, 401, 403, 404, 409                     |
| POST   | `/bills/:id/items`                   | `owner`    | `{ name, unitPriceCents, quantity }`                                         | `201 item`                                                            | 400, 401, 403, 404, 409                     |
| PATCH  | `/bills/:id/items/:itemId`           | `owner`    | `{ name?, unitPriceCents?, quantity? }`                                      | `200 item`                                                            | 400, 401, 403, 404, 409                     |
| DELETE | `/bills/:id/items/:itemId`           | `owner`    | none                                                                         | `204`                                                                 | 401, 403, 404, 409                          |
| POST   | `/bills/:id/receipt`                 | `owner`    | `multipart` field `image`: JPEG or PNG, max 5 MB                             | `201 { receipt, items[], serviceBp, gstBp, check }` (draft, editable) | 400, 401, 403, 404, 409, 413, 422, 429, 503 |
| POST   | `/bills/:id/receipt-text`            | `owner`    | `{ text }` (receipt text pasted from a chat or email, max 10,000 characters) | `201 { items[], serviceBp, gstBp }` (draft, editable)                 | 400, 401, 403, 404                          |
| POST   | `/bills/:id/lock`                    | `owner`    | none                                                                         | `200 bill` (status `LOCKED`)                                          | 401, 403, 404, 409                          |
| POST   | `/bills/:id/unlock`                  | `owner`    | none                                                                         | `200 bill` (status `OPEN`)                                            | 401, 403, 404, 409                          |
| GET    | `/bills/:id/summary`                 | `owner`    | none                                                                         | `200 summary` (see below)                                             | 401, 403, 404                               |
| PATCH  | `/bills/:id/payments/:participantId` | `owner`    | `{ paid: true \| false }`                                                    | `200 payment` + `status`                                              | 400, 401, 403, 404, 409                     |

- `serviceBp` defaults to `1000` (10%) and `gstBp` to `900` (9%). A hawker bill sends `serviceBp: 0`.
- Items can only change while the bill is `OPEN`; otherwise `409`.
- Every bill response includes `totals`: `{ subtotalCents, serviceCents, gstCents, totalCents, total }`, e.g. `total: "$35.37"`.
- `owner` routes go through `BillOwnerGuard`: a bill that does not exist answers `404`; someone else's bill answers `403 Only the owner of this bill can do this`. Bill IDs are long random strings, so a `403` does not help anyone guess other bills.
- Built so far (KAN-25): create, list, get and update bills; add, edit and delete items. These need a login (`JWT`) for now; the `verified` check comes with email verification.
- Built in KAN-27: `GET /share/:token`, `POST /share/:token/participants` and `GET /join/:code`. Join and join-code lookups are limited to 20 per minute per IP. A repeated name gets a suffix: `Ben`, `Ben (2)`.
- Built in KAN-28: `POST /share/:token/claims` (`{ itemId, shares? }`, upsert so claiming twice never duplicates), `DELETE /share/:token/claims/:itemId`, and `POST /bills/:id/lock` and `/unlock`. Claim routes need the guest token in an `X-Guest-Token` header, and it must be for this bill (`403` otherwise). Lock only works on an `OPEN` bill and unlock only on a `LOCKED` one (`409` otherwise). Logging each share as an expense on lock is KAN-79.
- **Scanned or pasted items are never saved straight away.** `POST /receipt` and `POST /receipt-text` return a draft for the owner to check and edit, then each item is saved with `POST /items`.
- Built in KAN-33: `POST /bills/:id/receipt` reads the photo with the provider in `OCR_PROVIDER` (Gemini in production, the Fake in tests and CI). Only the AI's answer is kept (`ReceiptImage.rawJson`), not the photo. 5 uploads per minute, the same as Gemini's free limit, and at most `AI_DAILY_LIMIT` scans (default 20) per account per Singapore day across both receipt routes (KAN-88, `429` with a message saying so).
  - `serviceBp` and `gstBp` are suggestions: `0` when the receipt shows no service charge, and `0` GST when the printed total equals the items' sum (GST already included, as at fast food and food courts).
  - `check` helps the owner spot mistakes: `subtotalMatches` (items vs the printed subtotal) and `totalMatches` (our total vs the printed total); `null` when the receipt doesn't show that number.
  - `409` locked bill (checked before calling the AI, so no quota is used), `413` over 5 MB, `422` the AI's answer failed validation, `429` free limit reached, `503` the AI is down or took over 60 s. Every error says the items can be added by hand.
  - `POST /expenses/receipt` is part of the Expenses API (KAN-76).
- **Lock** freezes the split and saves an `Expense` (source `BILL_SHARE`, category Food & Drinks, the bill's merchant or else its title, and its date) for every participant who has a user account and owes more than $0. Guests without an account are skipped. Built in KAN-79: `ClaimsService.lock` sends a `bill.locked` event with each account's total, and `BillShareListener` in the expenses code saves them, so the bills code never imports the expenses code. The bill only becomes `LOCKED` after the shares are saved.
- **Unlock** keeps those expenses. Locking again updates the amount, merchant and date in the same row (unique `userId` + `billId`) and keeps the person's own category and note. Someone who owes $0 by then loses their row.
- Payments can only be marked while the bill is `LOCKED` or `SETTLED`. The app never moves money; this only records that someone says they paid.
- Built in KAN-49: `PATCH /bills/:id/payments/:participantId` (`PaymentsModule`, owner only) answers `200 { participantId, paid, amountCents, paidCount, owingCount, status }`.
  - `amountCents` is a snapshot of what the person owed when ticked, so later edits can't silently change what was paid.
  - When everyone who owes something is ticked, the bill becomes `SETTLED`; unticking someone takes it back to `LOCKED`.
  - `409` while the bill is `OPEN`; `404` for someone who isn't on the bill; `400` for the owner, who doesn't pay themselves.
  - `POST /bills/:id/unlock` answers `409` while anyone is ticked as paid, because reopening could change what they paid.

## Share link (guests)

A guest reaches a bill in one of two ways: open the share link (contains `shareToken`), or type the bill's short **join code** (e.g. `K7P2Q`) on the home page. The code is easier to read out loud at the table.

- Join codes are 5 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no `0`/`O` or `1`/`I`, which look alike), and unique across bills.
- `GET /join/:code` is rate limited, so codes cannot be guessed by trying many in a row. A code stops working once the bill is `SETTLED`.

| Method | Path                           | Who      | Request body                                                | Response                                                  | Errors             |
| ------ | ------------------------------ | -------- | ----------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| GET    | `/join/:code`                  | `public` | none                                                        | `200 { shareToken }` (the app then opens `/share/:token`) | 404, 429           |
| GET    | `/share/:token`                | `public` | none                                                        | `200` bill, items, participants, claims                   | 404                |
| POST   | `/share/:token/participants`   | `public` | `{ displayName }`                                           | `201 { participant, guestToken }`                         | 400, 404, 409, 429 |
| POST   | `/share/:token/claims`         | `guest`  | `{ itemId }` (joins with 1 share, mode stays as the item's) | `201 claim`                                               | 400, 403, 404, 409 |
| PATCH  | `/share/:token/claims/:itemId` | `guest`  | `{ splitMode?, shares?, percentBp?, exactCents? }`          | `200` all claims on that item                             | 400, 403, 404, 409 |
| DELETE | `/share/:token/claims/:itemId` | `guest`  | none                                                        | `204`                                                     | 403, 404, 409      |
| GET    | `/share/:token/summary`        | `public` | none                                                        | `200 summary` + PayNow details and a QR payload per guest | 404                |

**Split mode rules** (checked by a custom validator, `400` if broken):

| `splitMode` | Each claim sends | Rule                                  | Example                        |
| ----------- | ---------------- | ------------------------------------- | ------------------------------ |
| `EQUAL`     | nothing          | Everyone pays the same                | 3 people on $10 → 334/333/333  |
| `SHARES`    | `shares`         | Whole numbers ≥ 1                     | 2:1 → two thirds and one third |
| `PERCENT`   | `percentBp`      | All claims add up to `10000` (100%)   | 6000 + 4000                    |
| `EXACT`     | `exactCents`     | All claims add up to the item's price | 1000 + 600 for a 1600 item     |

Claims can only change while the bill is `OPEN`; otherwise `409`.

**Changing an item's split** (built in KAN-74):

- Guest: `PATCH /share/:token/claims/:itemId` with the guest token. Owner: `PATCH /bills/:id/items/:itemId/split`.
- Body: `{ splitMode, entries: [{ participantId, shares? | percentBp? | exactCents? }] }`. `entries` must list exactly the people who claimed the item.
- Response: `{ itemId, splitMode, portions: [{ participantId, cents }] }`, e.g. 70% / 30% of $16.00 → `1120` / `480`.
- **Who may change it:** the owner, or any guest who claimed that item (`403` for anyone else). Simple on purpose: the people sharing an item sort it out between them.
- **Errors (`400`):** `Percentages add up to 90%, need 100%` (checked by the `@ValidSplitEntries` custom validator) and `Exact amounts add up to $15.00, need $16.00` (checked in the service, which knows the price).
- If someone claims or unclaims a `PERCENT` or `EXACT` item, it goes back to `EQUAL`, because the old values would no longer add up.

## Summary shape

Returned by `GET /bills/:id/summary` and `GET /share/:token/summary`. Per-person totals always add up to `totalCents`.

```json
{
  "subtotalCents": 2950,
  "serviceCents": 295,
  "gstCents": 292,
  "totalCents": 3537,
  "total": "$35.37",
  "unclaimedCents": 0,
  "people": [
    {
      "participantId": "p1",
      "displayName": "Chee",
      "isOwner": true,
      "itemsCents": 600,
      "serviceCents": 60,
      "gstCents": 60,
      "totalCents": 720,
      "total": "$7.20",
      "paid": false,
      "paynowPayload": null
    }
  ],
  "paynow": { "mobile": "+6591234567", "name": "Chee" }
}
```

`people` has one entry per participant (only Chee is shown here). Only the share summary has `paynow` and `paynowPayload`, so a guest can pay the owner; the owner's summary does not need them.

Built in KAN-29:

- The owner is listed first, then guests in the order they joined. Someone who claimed nothing still appears, owing `0`.
- The owner is a participant on their own bill, created the first time it is needed (linked by `userId`), so unclaimed items have someone to go to.
- The owner claims their own items with `POST /bills/:id/claims` `{ itemId, shares? }` and `DELETE /bills/:id/claims/:itemId` (login, owner only).
- `paid` is `false` until payments are tracked.

Built in KAN-47 and KAN-48:

- `paynowPayload` is the text of a PayNow QR (SGQR/EMVCo, CRC-16/CCITT-FALSE) for exactly that person's `totalCents`, made by `src/payments/paynow.ts`. The amount can't be changed in the bank app, and the reference is `SplitLah <joinCode>`.
- It is `null` for the owner, for anyone who owes `0`, and when the owner has no PayNow number (`paynow.mobile` is `null`).
- The web app only shows the QR once the bill is `LOCKED`, because the amounts can still change while it is open.

## Expenses

| Method | Path                                                          | Who        | Request body                                                    | Response                                                                   | Errors                            |
| ------ | ------------------------------------------------------------- | ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| GET    | `/expenses?month=YYYY-MM&page=1&pageSize=50` (or `from=&to=`) | `verified` | none                                                            | `200 { month \| from, to, page, pageSize, totalCount, items: expense[] }`  | 400, 401, 403                     |
| POST   | `/expenses`                                                   | `verified` | `{ amountCents, category, spentAt, merchant?, note?, source? }` | `201 expense` (source `MANUAL`, or `RECEIPT` for a saved scan)             | 400, 401, 403                     |
| PATCH  | `/expenses/:id`                                               | `verified` | `{ amountCents?, category?, merchant?, note?, spentAt? }`       | `200 expense`                                                              | 400, 401, 403, 404, 409           |
| DELETE | `/expenses/:id`                                               | `verified` | none                                                            | `204`                                                                      | 401, 403, 404, 409                |
| POST   | `/expenses/receipt`                                           | `verified` | `multipart` receipt photo (field `image`)                       | `201` draft `{ amountCents, amount, merchant, category, spentAt, source }` | 400, 401, 403, 413, 422, 429, 503 |
| GET    | `/expenses/summary?month=YYYY-MM` (or `from=&to=`)            | `verified` | none                                                            | `200 { month \| from, to, totalCents, total, byCategory[], byDay[] }`      | 400, 401, 403                     |
| GET    | `/expenses/category?merchant=Starbucks`                       | `verified` | none                                                            | `200 { category, from }`                                                   | 400, 401, 403                     |

- `category` is one of: `FOOD_DRINKS`, `GROCERIES`, `TRANSPORT`, `SHOPPING`, `GIFTS`, `ENTERTAINMENT`, `BILLS_UTILITIES`, `HEALTH`, `TRAVEL`, `OTHERS`.
- A `BILL_SHARE` expense comes from a locked bill. It cannot be deleted here (`409`); it changes with the bill. Its category can still be changed.
- **Guessing a category (KAN-78)**, in this order: what this user picked before for the merchant (`from: "memory"`), else the category the AI read from the receipt (`"ai"`; its `OTHERS` counts as no answer), else keyword rules such as `grab` → `TRANSPORT` (`"rules"`), else `OTHERS` (`"none"`). The rules work with Gemini switched off.
- When the user changes an expense's category, `MerchantCategory` remembers it for that merchant (lowercase, no punctuation, so "STARBUCKS!" = "Starbucks"), and the API logs one `category corrected` line, so corrections can be counted.
- Users only ever see their own expenses (`404` for someone else's, so IDs can't be probed).
- Built in KAN-76; `EmailVerifiedGuard` added in KAN-77. Remembering category changes (`MerchantCategory`) came in KAN-78, and `BILL_SHARE` expenses are created on lock (KAN-79).
  - **Months are Singapore time** (UTC+8): an expense at 11pm on 30 Nov is in November. `month` defaults to the current month in Singapore.
  - `expense` is `{ id, amountCents, amount, category, merchant, note, spentAt, source, billId, createdAt }`. Newest first; `pageSize` is 1 to 100 (default 50).
  - `byCategory[]` is `{ category, totalCents, total, count }`, biggest first. The category totals always add up to `totalCents`.
  - **Any run of days (KAN-94):** instead of `month`, send `from` and `to` (`YYYY-MM-DD`, Singapore days, both included), e.g. `from=2026-11-03&to=2026-11-09`. They must come together and without `month`, `to` can't be before `from`, and a range is at most 366 days; otherwise `400`. The answer echoes `{ from, to }` instead of `{ month }`.
  - `byDay[]` is `{ day, totalCents }` for each Singapore day that has spending, oldest first, for the chart. It also adds up to `totalCents`.
  - `amountCents` is 1 to 100000000 (whole cents). `source` can be `MANUAL` or `RECEIPT`; only a locked bill makes a `BILL_SHARE`.
  - A `BILL_SHARE`'s amount, merchant and date come from the bill, so changing them is `409`; `category` and `note` can change.
  - `POST /expenses/receipt` is a draft, nothing is saved: `amountCents` is the printed total (or the items added up), `category` is the guess above and `categoryFrom` says where it came from, and `spentAt` is `null` if no date was read. No total at all → `422`. Same limits as the bill receipt route (5 a minute, 5 MB, JPEG or PNG).

## Health

| Method | Path      | Who      | Response                         | Errors                        |
| ------ | --------- | -------- | -------------------------------- | ----------------------------- |
| GET    | `/health` | `public` | `200 { status: "ok", db: "up" }` | `503` if the database is down |

The deploy pipeline calls this after each release; anything other than `200` triggers a rollback. Built in KAN-36: it runs `SELECT 1` on the database, is never rate limited, and is also the Docker `HEALTHCHECK`.

## MVP features → endpoints

| Feature                            | Endpoints                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Sign up, log in, verify email      | `/auth/*`                                                                                                    |
| Set and check the PayNow number    | `POST /me/phone/telegram`, `POST /me/phone`, `POST /me/phone/verify`, `DELETE /me/phone` (QR upload was cut) |
| Create a bill                      | `POST /bills`                                                                                                |
| Scan or paste a receipt, then edit | `POST /bills/:id/receipt`, `POST /bills/:id/receipt-text`, `POST/PATCH/DELETE /bills/:id/items`              |
| Service charge and GST             | `PATCH /bills/:id` (`serviceBp`, `gstBp`)                                                                    |
| Share link / QR / join code        | `shareToken` and `joinCode` from `POST /bills`, `GET /join/:code`, `GET /share/:token`                       |
| Friends join without sign-up       | `POST /share/:token/participants`                                                                            |
| Tap items, adjust split            | `POST/PATCH/DELETE /share/:token/claims`                                                                     |
| See what each person owes          | `GET /bills/:id/summary`, `GET /share/:token/summary`                                                        |
| Pay back by PayNow                 | `paynow` in `GET /share/:token/summary`                                                                      |
| Lock bill, track payments          | `POST /bills/:id/lock`, `PATCH /bills/:id/payments/:participantId`                                           |
| Share auto-logged to my expenses   | `POST /bills/:id/lock` creates `BILL_SHARE` expenses                                                         |
| Monthly expenses and chart         | `GET /expenses`, `GET /expenses/summary`                                                                     |
| Add expense manually or by scan    | `POST /expenses`, `POST /expenses/receipt`                                                                   |
| Deploy health check                | `GET /health`                                                                                                |
