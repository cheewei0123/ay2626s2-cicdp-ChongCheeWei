# Receipt reading accuracy (KAN-33)

How well Gemini reads real receipts, measured with `apps/api/scripts/try-receipt.mjs` on 9 Nov 2026. The photos are kept outside the repo.

## Final results (Gemini 3.5 Flash-Lite, final prompt)

| Receipt                    | Type             | Items right | Items add up to the printed total | Category    | Time  | What made it hard                                           |
| -------------------------- | ---------------- | ----------- | --------------------------------- | ----------- | ----- | ----------------------------------------------------------- |
| Bess Kopitiam              | Kopitiam (MY)    | 8 / 8       | Yes (subtotal RM26.20)            | FOOD_DRINKS | 1.9 s | Rounding line (−0.02), 6% GST                               |
| Food Republic, City Square | Food court (SG)  | 7 / 7       | Yes ($26.00)                      | FOOD_DRINKS | 1.7 s | Prices printed half a line off; "CASH 50.00" line to ignore |
| McDonald's                 | Fast food (SG)   | 3 / 3       | Yes ($20.20)                      | FOOD_DRINKS | 1.9 s | "−$2.00" app discount; free add-on lines; GST included      |
| Coffee Supreme             | Café (NZ)        | 5 / 5       | Yes ($64.50)                      | FOOD_DRINKS | 2.0 s | No subtotal line; tax included; D/M/Y date                  |
| NTUC FairPrice, Bishan     | Supermarket (SG) | 7 / 7       | Yes ($37.70)                      | GROCERIES   | 2.3 s | "2 FOR $7.95" deals (unit price $3.975); card number masked |

**35 / 35 items correct, 5 / 5 totals match.** For the kopitiam, the app would still flag the total (`totalMatches: false`), because it suggests Singapore's 9% GST and that receipt charged Malaysia's 6%. The check is meant to catch exactly that.

## What the receipts taught me (each led to a change)

| Problem found                                                          | Change                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Gemini 3.8 Flash took **100 s** on one receipt                         | Compared models (below); thinking set to `LOW`; 60 s timeout that answers `503` "add the items by hand"      |
| McDonald's discount came back as a $0 item, so the items didn't add up | Prompt: subtract a discount from the item it applies to (Latte $4.00 → $2.00)                                |
| NTUC "2 FOR $7.95": $3.975 is not a whole number of cents              | Prompt: return a deal once at its total, count in the name ("2x BUTTER", $7.95). Money stays exact           |
| Many receipts include GST in the total, but bills add 9% on top        | The draft suggests `gstBp: 0` when the printed total equals the items' sum, and `serviceBp: 0` if none shown |
| Café receipt has no subtotal line, so "total = subtotal" missed it     | Compare the total with the **items' sum** instead                                                            |

## Choosing the model

| Model                     | Free limit (per day / per minute) | Time on the same receipt | Accuracy             |
| ------------------------- | --------------------------------- | ------------------------ | -------------------- |
| Gemini 3.8 Flash          | 20 / 5                            | 100 s, then over 30 s    | 8 / 8                |
| `gemini-3.5-flash`        | 20 / 5 (counted as 3.6 Flash)     | 3–17 s                   | 4 receipts right     |
| **Gemini 3.5 Flash-Lite** | **500 / 15**                      | **about 2 s**            | **5 receipts right** |

Flash-Lite was the fastest, read every test receipt correctly, and allows 25 times more requests a day. Because the model is a setting (`GEMINI_MODEL`), each switch was a one-line change. Evidence: [3.8 Flash limits](evidence/kan-33-gemini-free-limits.png), [limits by model](evidence/kan-33-gemini-limits-by-model.png).

## Limits of this test

- Only 5 receipts, and 3 of the photos were found online (watermarks from Lianhe Zaobao and Stomp); 2 are not from Singapore. A bigger test with my own receipts would be more convincing.
- The AI can still be wrong, so the app never saves its answer directly: the owner gets a draft with two checks and edits it first.
- **Privacy:** on the free tier, Google may use uploaded content to improve its products. The photo itself is not stored by SplitLah, but users should cover card numbers and names before scanning, and the app should tell them so.
