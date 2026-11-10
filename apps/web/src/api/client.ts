// The one place that talks to the API: base URL, login token and readable errors.

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The login token (a JWT that lasts 1 hour) is kept in localStorage, so a refresh keeps you logged in
const TOKEN_KEY = 'splitlah.token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// AuthProvider sets this, so an expired token logs you out wherever the 401 happens
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

type Options = { method?: string; body?: unknown };

export async function api<T>(
  path: string,
  { method = 'GET', body }: Options = {},
): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Can't reach SplitLah. Check your internet connection.",
    );
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, errorMessage(res.status, data));
  }
  return data as T;
}

// The API's names for fields, as a person would say them
const FIELD_NAMES: Record<string, string> = {
  displayName: 'Name',
  paynowMobile: 'PayNow number',
};

function readable(message: string) {
  const [first, ...rest] = message.split(' ');
  const text = [FIELD_NAMES[first] ?? first, ...rest].join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Turns the API's error JSON { statusCode, message, ... } into one sentence (or one per line)
export function errorMessage(status: number, data: unknown): string {
  if (status === 429) return 'Too many tries. Wait a minute and try again.';
  if (status >= 500)
    return 'Something went wrong on our side. Please try again.';
  const message = (data as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.map(readable).join('\n');
  if (typeof message === 'string') return readable(message);
  return 'Something went wrong. Please try again.';
}
