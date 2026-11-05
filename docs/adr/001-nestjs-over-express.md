# ADR 001: NestJS instead of plain Express

**Status:** Accepted · **Date:** 2026-11-05

## Context

I already know Express. The backend needs auth, guards for bill owners and guests, input validation, and services that tests can swap for fakes (OCR, email). The report also asks for clear structure and design patterns.

## Decision

Use **NestJS** for the API.

## Alternatives

- **Express:** faster to start because I know it, but I would have to hand-build structure, validation and dependency injection, and every project does it differently.
- **Fastify:** fast, but the same gap as Express for structure.

## Consequences

- Good: modules, DI, guards, pipes and interceptors come built in, so each rule has an obvious place. Tests can swap providers with `Test.createTestingModule`.
- Good: NestJS runs on top of Express, so what I know still applies underneath.
- Cost: more files and decorators to learn at the start (see the KAN-13 learning-log entry).
