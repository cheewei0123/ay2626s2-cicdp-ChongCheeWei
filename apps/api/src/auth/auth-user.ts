// What JwtAuthGuard puts on the request after checking the token
export interface AuthUser {
  id: string;
  email: string;
}

// What is inside a login token: `sub` (subject) is the standard JWT field for the user ID
export interface JwtPayload {
  sub: string;
  email: string;
  typ?: undefined;
}

// What is inside a guest token (from joining a bill): `sub` is the participant ID.
// `typ: 'guest'` marks it, so JwtAuthGuard can refuse it on login-only routes.
export interface GuestPayload {
  sub: string;
  billId: string;
  typ: 'guest';
}

// Lets TypeScript know that `req.user` can exist on an Express request
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
