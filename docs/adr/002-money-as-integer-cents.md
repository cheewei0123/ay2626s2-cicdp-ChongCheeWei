# ADR 002: Money as integer cents, rates as basis points

**Status:** Accepted · **Date:** 2026-11-05

## Context

JavaScript numbers are floating point, so `0.1 + 0.2` is `0.30000000000000004`. A bill splitter that is off by one cent makes the per-person totals not match the receipt, which users notice.

## Decision

- Store and calculate every amount as a whole number of **cents** (`$12.50` → `1250`).
- Store rates and percentages as whole **basis points** (`10%` → `1000`, `9%` → `900`, `100%` → `10000`).
- Round with integers only: `Math.floor((amount * bp + 5000) / 10000)` rounds half up.
- Give leftover cents out with the **largest remainder** method so the split always adds up to the receipt total.

## Alternatives

- **Floats (dollars):** simple, but rounding errors build up.
- **`Decimal` type / decimal library:** exact, but slower, another dependency, and harder to explain line by line.

## Consequences

- Good: no rounding drift; the brief's bill gives exactly 720 + 899 + 959 + 959 = 3537.
- Good: Postgres `Int` columns; no conversion when reading from the database.
- Cost: format as dollars only when displaying.
- Found later (KAN-21): very large bills can overflow normal numbers during the split, so that part uses `BigInt`.
