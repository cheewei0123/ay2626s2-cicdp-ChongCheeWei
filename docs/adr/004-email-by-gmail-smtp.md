# ADR 004: Verification emails through Gmail SMTP

**Status:** Accepted, implemented in KAN-77 · **Date:** 2026-11-22

## Context

New accounts must prove they own their email (KAN-77) before they can start bills or log expenses. That needs real emails from the live site, with a $0 budget and no domain of my own (the site is on `splitlah.duckdns.org`). Tests and CI must never send real email.

## Decision

Send with **nodemailer over Gmail SMTP**, using a Gmail address and a Google **app password** kept only in the server `.env` (`SMTP_USER`, `SMTP_PASS`). It sits behind `EMAIL_SERVICE`, the same strategy pattern as OCR (ADR 003): `EMAIL_PROVIDER=smtp` on the live site, `fake` (the default) everywhere else. The fake keeps each email in memory, so the e2e test opens the link like a person would.

## Alternatives

- **Resend:** a nice API and free tier, but sending to anyone other than yourself needs a verified domain, and DuckDNS can't add the DNS records.
- **Amazon SES:** cheap, but new accounts start in the sandbox (only verified recipients) and leaving it needs a support request to AWS.
- **No real email (log the link only):** free and simple, but then nothing is actually verified on the live site.

## Consequences

- Good: free (about 500 emails a day), works today with no domain, and nodemailer is the standard Node mailer.
- Good: switching to another SMTP service later is only a change to the `.env`.
- Cost: emails come from a gmail.com address and may land in spam; the banner says to check there.
- Cost: an app password is a real secret. It never goes into git or CI, and can be revoked in the Google account at any time.
