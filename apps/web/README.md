# SplitLah web app

React 19 PWA for SplitLah (Vite 8, Tailwind CSS 4). See the root [README](../../README.md) for the project overview and how to run everything.

## Run locally

Start the API first (see `apps/api`), then from the repo root:

```bash
npm run dev -w apps/web   # http://localhost:5173; /api is passed to the API on :3000
```

## Test

From the repo root:

```bash
npm test -w apps/web                # component tests (jsdom, fake API) with the 90% coverage gate
npm run test:browser -w apps/web    # Playwright, WebKit as iPhone 14, against the Docker stack
```

The browser tests need the app running in Docker first: see [docs/pipeline.md](../../docs/pipeline.md#browser-tests-playwright-kan-53).

## Where things are

- `src/pages/`: one file per screen; `src/routes.tsx` lists them and who can open them
- `src/components/`: shared pieces (`Page`, `Field`, glass rows and buttons)
- `src/api/client.ts`: the only place that calls the API
- `e2e/`: Playwright browser tests
- Look and feel: [docs/ui-design.md](../../docs/ui-design.md)
