import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test-utils';
import {
  api,
  ApiError,
  errorMessage,
  setUnauthorizedHandler,
  tokenStore,
} from './client';

describe('api()', () => {
  it('calls /api with the login token and a JSON body, and returns the JSON', async () => {
    const fetchMock = fakeApi({
      'POST /api/bills': { status: 201, body: { id: 'b1' } },
    });
    tokenStore.set('jwt-1');

    await expect(
      api('/bills', { method: 'POST', body: { title: 'Dinner' } }),
    ).resolves.toEqual({
      id: 'b1',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/bills', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer jwt-1',
        'Content-Type': 'application/json',
      },
      body: '{"title":"Dinner"}',
    });
  });

  it('sends no token and no body when there are none', async () => {
    const fetchMock = fakeApi({
      'GET /api/health': { status: 200, body: { status: 'ok' } },
    });
    await api('/health');
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      method: 'GET',
      headers: {},
      body: undefined,
    });
  });

  it('returns nothing for 204 No Content', async () => {
    fakeApi({ 'DELETE /api/expenses/e1': { status: 204 } });
    await expect(
      api('/expenses/e1', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('turns a network failure into a readable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(api('/me')).rejects.toEqual(
      new ApiError(0, "Can't reach SplitLah. Check your internet connection."),
    );
  });

  it('throws an ApiError with the status and a readable message', async () => {
    fakeApi({
      'POST /api/auth/login': {
        status: 401,
        body: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        },
      },
    });
    const error = await api('/auth/login', { method: 'POST', body: {} }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });

  it('logs you out on 401 only if a token was sent (it has expired)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fakeApi({
      'GET /api/me': { status: 401, body: { message: 'Unauthorized' } },
    });

    await api('/me').catch(() => {});
    expect(handler).not.toHaveBeenCalled(); // no token: just a wrong password, say

    tokenStore.set('old-jwt');
    await api('/me').catch(() => {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('copes with an error that has no JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })),
    );
    await expect(api('/me')).rejects.toMatchObject({
      status: 502,
      message: 'Something went wrong on our side. Please try again.',
    });
  });
});

describe('errorMessage()', () => {
  it('uses field names a person would say, one problem per line', () => {
    expect(
      errorMessage(400, {
        message: [
          'displayName must be 1 to 50 characters',
          'paynowMobile must be a Singapore mobile number like +6591234567',
          'email must be a valid email address',
        ],
      }),
    ).toBe(
      'Name must be 1 to 50 characters\n' +
        'PayNow number must be a Singapore mobile number like +6591234567\n' +
        'Email must be a valid email address',
    );
  });

  it('keeps a single message', () => {
    expect(errorMessage(409, { message: 'Email is already registered' })).toBe(
      'Email is already registered',
    );
  });

  it('has its own words for too many tries and server errors', () => {
    expect(
      errorMessage(429, { message: 'ThrottlerException: Too Many Requests' }),
    ).toBe('Too many tries. Wait a minute and try again.');
    expect(errorMessage(500, { message: 'Internal server error' })).toBe(
      'Something went wrong on our side. Please try again.',
    );
  });

  it('falls back to a general message when there is none', () => {
    expect(errorMessage(400, null)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
