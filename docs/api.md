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
| `owner`    | Verified **and** owns this bill (`BillOwnerGuard`)          | same                                         |
| `guest`    | Has the bill's share link, plus a guest token after joining | `:token` in the URL + `X-Guest-Token` header |

A guest gets the guest token when they join (`POST /share/:token/participants`). It identifies which participant they are, so they can only change their own claims. No sign-up needed.

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

| Method | Path                        | Who      | Request body                                      | Response                    | Errors        |
| ------ | --------------------------- | -------- | ------------------------------------------------- | --------------------------- | ------------- |
| POST   | `/auth/register`            | `public` | `{ email, password, displayName, paynowMobile? }` | `201 { user, accessToken }` | 400, 409, 429 |
| POST   | `/auth/login`               | `public` | `{ email, password }`                             | `200 { user, accessToken }` | 400, 401, 429 |
| POST   | `/auth/verify-email`        | `public` | `{ token }` (from the email link)                 | `200 { emailVerifiedAt }`   | 400, 404, 409 |
| POST   | `/auth/resend-verification` | `JWT`    | none                                              | `204`                       | 401, 409, 429 |

- Emails are trimmed and lower-cased, so `Chee@Example.com` and `chee@example.com` are one account.
- Passwords: 8 to 128 characters. Only a salted scrypt hash is stored.
- A wrong password and an unknown email get the same `401 Invalid email or password`, so nobody can find out which emails have accounts.
- The `accessToken` is a JWT that lasts 1 hour. Send it as `Authorization: Bearer <token>`.
- Auth routes are limited to 10 requests per minute per IP.
- Verification token: only its hash is stored; it expires after 24 hours and works once.

## Profile

| Method | Path            | Who   | Request body                              | Response                                  | Errors        |
| ------ | --------------- | ----- | ----------------------------------------- | ----------------------------------------- | ------------- |
| GET    | `/me`           | `JWT` | none                                      | `200 user`                                | 401           |
| PATCH  | `/me`           | `JWT` | `{ displayName?, phone?, paynowMobile? }` | `200 user`                                | 400, 401      |
| POST   | `/me/paynow-qr` | `JWT` | `multipart` image of the user's PayNow QR | `200 { paynowMobile }` (read from the QR) | 400, 401, 413 |

`paynowMobile` must be a Singapore mobile number (`+65` and 8 digits starting with 8 or 9).

## Bills (owner)

| Method | Path                                 | Who        | Request body                                                                 | Response                                              | Errors                  |
| ------ | ------------------------------------ | ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| POST   | `/bills`                             | `verified` | `{ title, merchant?, date?, serviceBp?, gstBp? }`                            | `201 bill` (with `shareToken` and `joinCode`)         | 400, 401, 403           |
| GET    | `/bills`                             | `verified` | none                                                                         | `200 bill[]` (mine, newest first)                     | 401, 403                |
| GET    | `/bills/:id`                         | `owner`    | none                                                                         | `200 bill` with items, participants, claims           | 401, 403, 404           |
| PATCH  | `/bills/:id`                         | `owner`    | `{ title?, merchant?, date?, serviceBp?, gstBp? }`                           | `200 bill`                                            | 400, 401, 403, 404, 409 |
| POST   | `/bills/:id/items`                   | `owner`    | `{ name, unitPriceCents, quantity }`                                         | `201 item`                                            | 400, 401, 403, 404, 409 |
| PATCH  | `/bills/:id/items/:itemId`           | `owner`    | `{ name?, unitPriceCents?, quantity? }`                                      | `200 item`                                            | 400, 401, 403, 404, 409 |
| DELETE | `/bills/:id/items/:itemId`           | `owner`    | none                                                                         | `204`                                                 | 401, 403, 404, 409      |
| POST   | `/bills/:id/receipt`                 | `owner`    | `multipart` receipt photo                                                    | `201 { items[], serviceBp, gstBp }` (draft, editable) | 400, 401, 403, 404, 413 |
| POST   | `/bills/:id/receipt-text`            | `owner`    | `{ text }` (receipt text pasted from a chat or email, max 10,000 characters) | `201 { items[], serviceBp, gstBp }` (draft, editable) | 400, 401, 403, 404      |
| POST   | `/bills/:id/lock`                    | `owner`    | none                                                                         | `200 bill` (status `LOCKED`)                          | 401, 403, 404, 409      |
| POST   | `/bills/:id/unlock`                  | `owner`    | none                                                                         | `200 bill` (status `OPEN`)                            | 401, 403, 404, 409      |
| GET    | `/bills/:id/summary`                 | `owner`    | none                                                                         | `200 summary` (see below)                             | 401, 403, 404           |
| PATCH  | `/bills/:id/payments/:participantId` | `owner`    | `{ paid: true \| false }`                                                    | `200 payment`                                         | 400, 401, 403, 404, 409 |

- `serviceBp` defaults to `1000` (10%) and `gstBp` to `900` (9%). A hawker bill sends `serviceBp: 0`.
- Items can only change while the bill is `OPEN`; otherwise `409`.
- Every bill response includes `totals`: `{ subtotalCents, serviceCents, gstCents, totalCents, total }`, e.g. `total: "$35.37"`.
- `owner` routes go through `BillOwnerGuard`: a bill that does not exist answers `404`; someone else's bill answers `403 Only the owner of this bill can do this`. Bill IDs are long random strings, so a `403` does not help anyone guess other bills.
- Built so far (KAN-25): create, list, get and update bills; add, edit and delete items. These need a login (`JWT`) for now; the `verified` check comes with email verification, and `joinCode` with the share link (KAN-27).
- **Scanned or pasted items are never saved straight away.** `POST /receipt` and `POST /receipt-text` return a draft for the owner to check and edit, then each item is saved with `POST /items`.
- **Lock** freezes the split and creates an `Expense` (source `BILL_SHARE`) for every participant who has a user account. **Unlock** removes those expenses.
- Payments can only be marked while the bill is `LOCKED`. The app never moves money; this only records that someone says they paid.

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
| GET    | `/share/:token/summary`        | `public` | none                                                        | `200 summary` + the owner's PayNow details                | 404                |

**Split mode rules** (checked by a custom validator, `400` if broken):

| `splitMode` | Each claim sends | Rule                                  | Example                        |
| ----------- | ---------------- | ------------------------------------- | ------------------------------ |
| `EQUAL`     | nothing          | Everyone pays the same                | 3 people on $10 → 334/333/333  |
| `SHARES`    | `shares`         | Whole numbers ≥ 1                     | 2:1 → two thirds and one third |
| `PERCENT`   | `percentBp`      | All claims add up to `10000` (100%)   | 6000 + 4000                    |
| `EXACT`     | `exactCents`     | All claims add up to the item's price | 1000 + 600 for a 1600 item     |

Claims can only change while the bill is `OPEN`; otherwise `409`.

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
      "itemsCents": 600,
      "serviceCents": 60,
      "gstCents": 60,
      "totalCents": 720,
      "total": "$7.20",
      "paid": false
    }
  ],
  "paynow": { "mobile": "+6591234567", "qrPayload": "000201…" }
}
```

`people` has one entry per participant (only Chee is shown here). The share summary includes `paynow` so a guest can pay the owner; the owner's summary does not need it.

## Expenses

| Method | Path                              | Who        | Request body                                              | Response                                                   | Errors             |
| ------ | --------------------------------- | ---------- | --------------------------------------------------------- | ---------------------------------------------------------- | ------------------ |
| GET    | `/expenses?month=YYYY-MM`         | `verified` | none                                                      | `200 expense[]` for that month                             | 400, 401, 403      |
| POST   | `/expenses`                       | `verified` | `{ amountCents, category, merchant?, note?, spentAt }`    | `201 expense` (source `MANUAL`)                            | 400, 401, 403      |
| PATCH  | `/expenses/:id`                   | `verified` | `{ amountCents?, category?, merchant?, note?, spentAt? }` | `200 expense`                                              | 400, 401, 403, 404 |
| DELETE | `/expenses/:id`                   | `verified` | none                                                      | `204`                                                      | 401, 403, 404, 409 |
| POST   | `/expenses/receipt`               | `verified` | `multipart` receipt photo                                 | `201` draft `{ amountCents, merchant, category, spentAt }` | 400, 401, 403, 413 |
| GET    | `/expenses/summary?month=YYYY-MM` | `verified` | none                                                      | `200 { totalCents, total, byCategory[] }`                  | 400, 401, 403      |

- `category` is one of: `FOOD_DRINKS`, `GROCERIES`, `TRANSPORT`, `SHOPPING`, `GIFTS`, `ENTERTAINMENT`, `BILLS_UTILITIES`, `HEALTH`, `TRAVEL`, `OTHERS`.
- A `BILL_SHARE` expense comes from a locked bill. It cannot be deleted here (`409`); unlock the bill instead. Its category can still be changed.
- When the user changes a category, `MerchantCategory` remembers it, so the next receipt from the same merchant gets that category.
- Users only ever see their own expenses (`404` for someone else's, so IDs can't be probed).

## Health

| Method | Path      | Who      | Response                         | Errors                        |
| ------ | --------- | -------- | -------------------------------- | ----------------------------- |
| GET    | `/health` | `public` | `200 { status: "ok", db: "up" }` | `503` if the database is down |

The deploy pipeline calls this after each release; anything other than `200` triggers a rollback.

## MVP features → endpoints

| Feature                            | Endpoints                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sign up, log in, verify email      | `/auth/*`                                                                                       |
| Set PayNow number or upload QR     | `PATCH /me`, `POST /me/paynow-qr`                                                               |
| Create a bill                      | `POST /bills`                                                                                   |
| Scan or paste a receipt, then edit | `POST /bills/:id/receipt`, `POST /bills/:id/receipt-text`, `POST/PATCH/DELETE /bills/:id/items` |
| Service charge and GST             | `PATCH /bills/:id` (`serviceBp`, `gstBp`)                                                       |
| Share link / QR / join code        | `shareToken` and `joinCode` from `POST /bills`, `GET /join/:code`, `GET /share/:token`          |
| Friends join without sign-up       | `POST /share/:token/participants`                                                               |
| Tap items, adjust split            | `POST/PATCH/DELETE /share/:token/claims`                                                        |
| See what each person owes          | `GET /bills/:id/summary`, `GET /share/:token/summary`                                           |
| Pay back by PayNow                 | `paynow` in `GET /share/:token/summary`                                                         |
| Lock bill, track payments          | `POST /bills/:id/lock`, `PATCH /bills/:id/payments/:participantId`                              |
| Share auto-logged to my expenses   | `POST /bills/:id/lock` creates `BILL_SHARE` expenses                                            |
| Monthly expenses and chart         | `GET /expenses`, `GET /expenses/summary`                                                        |
| Add expense manually or by scan    | `POST /expenses`, `POST /expenses/receipt`                                                      |
| Deploy health check                | `GET /health`                                                                                   |
