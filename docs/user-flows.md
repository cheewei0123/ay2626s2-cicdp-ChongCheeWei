# User flows and screens

What each type of user does, screen by screen, and which API endpoint (`docs/api.md`) each action calls. Mobile first: every screen is designed for iPhone width (about 390 px). Wireframes are in `docs/wireframes/`.

## 1. Owner: split a bill

```mermaid
flowchart TD
  A[Sign up] --> B[Verify email]
  B --> C[Set PayNow<br/>number or QR]
  C --> D[New bill]
  D --> E{Add items}
  E -->|scan| E1[Scan receipt]
  E -->|paste| E2[Paste text]
  E -->|type| F
  E1 --> F[Check and<br/>fix items]
  E2 --> F
  F --> G[Service + GST]
  G --> H[Share link / QR]
  H --> I[Watch claims]
  I --> J{All items<br/>claimed?}
  J -->|no| I
  J -->|yes| K[Lock bill]
  K --> L[Summary]
  L --> M[Mark who paid]
  K --> N[My share in<br/>My expenses]
```

- Three ways to add items: scan a photo, paste receipt text (e.g. from a delivery app or email), or type them in by hand. Scanned and pasted items are always a draft to check.
- The owner can lock with items still unclaimed; those go to the owner and the summary warns about them.

## 2. Guest: pay my share

```mermaid
flowchart TD
  A1[Open share link] --> B[Enter my name]
  A2[Type join code] --> B
  B --> C[Tap my items]
  C --> D{Shared item?}
  D -->|yes| E[Adjust split<br/>4 modes]
  D -->|no| F[My total]
  E --> F
  F --> G{How to pay?}
  G -->|scan| H[PayNow QR]
  G -->|copy| I[Copy number<br/>and amount]
```

- Two ways in: the share link (or its QR), or the 5-character join code read out at the table.
- No sign-up: the guest only types a name. The guest token is kept in the browser so they can come back and change their claims.
- Claims can be changed until the owner locks the bill.

## 3. Me: track my spending

```mermaid
flowchart TD
  A[My expenses] --> B[This month<br/>total + chart]
  A --> C{Add expense}
  C -->|manual| D[Type amount,<br/>category]
  C -->|scan| E[Scan receipt]
  E --> F[AI suggests<br/>amount + category]
  F --> G[Fix if wrong]
  D --> H[Saved]
  G --> H
  H --> B
  I[Locked bill] -.->|auto| B
```

- If I change a category, the app remembers it for that merchant next time.
- Shares from locked bills appear automatically (dashed arrow); I don't add them myself.

## Screens

| #   | Screen               | Shows                                                                   | Actions → endpoint                                                                                                                |
| --- | -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Login / Register     | Email, password, name (register only), "Have a code?" link              | Log in → `POST /auth/login` · Register → `POST /auth/register` · Have a code? → screen 19                                         |
| 2   | Verify email         | "Check your inbox", resend button                                       | Link in email → `POST /auth/verify-email` · Resend → `POST /auth/resend-verification`                                             |
| 3   | Profile              | Email + verified badge, phone, PayNow number or QR                      | Load → `GET /me` · Save → `PATCH /me` · Upload QR → `POST /me/paynow-qr`                                                          |
| 4   | Home tabs            | Bills · Expenses · Profile                                              | Switches tabs (no call)                                                                                                           |
| 5   | My bills             | List of my bills with status and total                                  | Load → `GET /bills` · New bill → `POST /bills`                                                                                    |
| 6   | Add items            | Choose: scan, paste text or type; camera preview for scan               | Take photo → `POST /bills/:id/receipt` · Paste text → screen 18 · Type it in → screen 7                                           |
| 7   | Edit items           | Item list, add/edit/delete, service and GST, our total vs receipt total | Add → `POST /bills/:id/items` · Edit → `PATCH …/items/:itemId` · Delete → `DELETE …/items/:itemId` · Charges → `PATCH /bills/:id` |
| 8   | Share                | Share link, QR code, 5-character join code, copy button                 | Uses `shareToken` and `joinCode` from the bill (no call)                                                                          |
| 9   | Guest join           | Bill title, "Your name" field                                           | Load → `GET /share/:token` · Join → `POST /share/:token/participants`                                                             |
| 10  | Claim items          | Items with who has claimed each, tap to claim                           | Tap → `POST /share/:token/claims` · Untap → `DELETE /share/:token/claims/:itemId`                                                 |
| 11  | Adjust split (sheet) | Mode buttons (equal / % / shares / exact), one field per person         | Save → `PATCH /share/:token/claims/:itemId`                                                                                       |
| 12  | Summary              | Per-person totals, unclaimed warning, lock button                       | Load → `GET /bills/:id/summary` (owner) or `GET /share/:token/summary` (guest) · Lock → `POST /bills/:id/lock`                    |
| 13  | Pay                  | My total, PayNow QR, copy number, copy amount                           | Load → `GET /share/:token/summary` (QR built from `paynow`)                                                                       |
| 14  | Payment tracker      | Each person, amount, paid or not                                        | Load → `GET /bills/:id/summary` · Toggle → `PATCH /bills/:id/payments/:participantId`                                             |
| 15  | This month           | Month total, category chart, expense list, month picker                 | Load → `GET /expenses/summary?month=` + `GET /expenses?month=`                                                                    |
| 16  | Add expense          | Manual form or scan                                                     | Save → `POST /expenses` · Scan → `POST /expenses/receipt`                                                                         |
| 17  | Edit expense         | Same form, filled in, delete button                                     | Save → `PATCH /expenses/:id` · Delete → `DELETE /expenses/:id`                                                                    |
| 18  | Paste receipt text   | Big text box, hint on where to copy from                                | Read items → `POST /bills/:id/receipt-text` (then screen 7)                                                                       |
| 19  | Enter join code      | 5 boxes for the code                                                    | Join → `GET /join/:code` (then screen 9)                                                                                          |

## Wireframes

Low-fi, grey boxes only: they show what is on each screen, not the final look. Numbers match the screen table above.

| #1 Login / Register                                                              | #2 Verify email                                                                     | #3 Profile                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| <img src="wireframes/01-login.svg" width="220" alt="Login / Register wireframe"> | <img src="wireframes/02-verify-email.svg" width="220" alt="Verify email wireframe"> | <img src="wireframes/03-profile.svg" width="220" alt="Profile wireframe"> |

| #4 Home tabs                                                                  | #5 My bills                                                                 | #6 Add items                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| <img src="wireframes/04-home-tabs.svg" width="220" alt="Home tabs wireframe"> | <img src="wireframes/05-my-bills.svg" width="220" alt="My bills wireframe"> | <img src="wireframes/06-add-items.svg" width="220" alt="Add items wireframe"> |

| #7 Edit items                                                                   | #8 Share                                                              | #9 Guest join                                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| <img src="wireframes/07-edit-items.svg" width="220" alt="Edit items wireframe"> | <img src="wireframes/08-share.svg" width="220" alt="Share wireframe"> | <img src="wireframes/09-guest-join.svg" width="220" alt="Guest join wireframe"> |

| #10 Claim items                                                                   | #11 Adjust split                                                                    | #12 Summary                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| <img src="wireframes/10-claim-items.svg" width="220" alt="Claim items wireframe"> | <img src="wireframes/11-adjust-split.svg" width="220" alt="Adjust split wireframe"> | <img src="wireframes/12-summary.svg" width="220" alt="Summary wireframe"> |

| #13 Pay                                                           | #14 Payment tracker                                                                       | #15 This month                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| <img src="wireframes/13-pay.svg" width="220" alt="Pay wireframe"> | <img src="wireframes/14-payment-tracker.svg" width="220" alt="Payment tracker wireframe"> | <img src="wireframes/15-this-month.svg" width="220" alt="This month wireframe"> |

| #16 Add expense                                                                   | #17 Edit expense                                                                    | #18 Paste receipt text                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| <img src="wireframes/16-add-expense.svg" width="220" alt="Add expense wireframe"> | <img src="wireframes/17-edit-expense.svg" width="220" alt="Edit expense wireframe"> | <img src="wireframes/18-paste-text.svg" width="220" alt="Paste receipt text wireframe"> |

| #19 Enter join code                                                                 |
| ----------------------------------------------------------------------------------- |
| <img src="wireframes/19-join-code.svg" width="220" alt="Enter join code wireframe"> |
