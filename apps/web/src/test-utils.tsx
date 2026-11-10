// Helpers for tests: a fake API instead of the network, and the app at any URL
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from './auth/AuthProvider';
import { routes } from './routes';

type Reply = { status: number; body?: unknown };

// Answers fetch calls by "METHOD /path", e.g. { 'POST /api/auth/login': { status: 200, body } }.
// A reply can be a Promise to test what the page shows while it waits.
export function fakeApi(replies: Record<string, Reply | Promise<Reply>>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    if (!(key in replies)) throw new Error(`No fake reply for ${key}`);
    const { status, body } = await replies[key];
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The whole app (same routes as production) opened at `path`
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}
