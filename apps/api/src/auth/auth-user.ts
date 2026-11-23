// What JwtAuthGuard puts on the request after checking the token
export interface AuthUser {
  id: string;
  email: string;
  sessionId: string; // the Session row this login belongs to (KAN-97)
}

// What is inside a login token: `sub` (subject) is the standard JWT field for the user ID
// `ver` is the user's sessionVersion when the token was made: changing the password
// raises it, so every older token stops working (KAN-90)
// `sid` is the Session row, so one login can be ended on its own (KAN-97)
export interface JwtPayload {
  sub: string;
  email: string;
  ver?: number;
  sid?: string;
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
