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

// The calls that send something (not GETs): the Log in and Register pages also
// ask GET /api/auth/google whether to show "Continue with Google" (KAN-95)
export const sent = (fetchMock: ReturnType<typeof fakeApi>) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET');

// The whole app (same routes as production) opened at `path`
// (or at a path with the state another page would pass along)
export function renderApp(path: string | { pathname: string; state: unknown }) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}
