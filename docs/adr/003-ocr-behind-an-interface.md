# ADR 003: OCR behind an interface with dependency injection

**Status:** Accepted, implemented in KAN-31 (Fake) and KAN-33 (Gemini) · **Date:** 2026-11-05

## Context

Receipts are read by AI (Gemini free tier). Tests and CI must not call Gemini: it needs an API key, has rate limits, and gives slightly different answers each time, which makes tests flaky. I may also want an offline option (Tesseract).

## Decision

Define one `OcrService` interface and register the implementation under the token `OCR_SERVICE`. Config (`OCR_PROVIDER`) picks **Gemini**, **Tesseract** or **Fake**. Code that needs OCR asks for `OCR_SERVICE` and never knows which one it got. Email follows the same pattern (`EMAIL_SERVICE`: Resend / SMTP / Fake).

## Alternatives

- **Call Gemini directly in the service:** less code, but tests would need the real API or messy mocking.
- **`if (provider === ...)` checks everywhere:** works, but every new provider means editing many files.

## Consequences

- Good: tests and CI use the Fake, so they are fast, free and always give the same result.
- Good: switching provider is a config change, not a code change.
- Good: this is the strategy pattern and dependency injection, both needed for the report.
- Cost: one extra interface and a small factory to choose the implementation.
