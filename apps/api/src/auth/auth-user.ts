// What JwtAuthGuard puts on the request after checking the token
export interface AuthUser {
  id: string;
  email: string;
}

// What is inside the token: `sub` (subject) is the standard JWT field for the user ID
export interface JwtPayload {
  sub: string;
  email: string;
}

// Lets TypeScript know that `req.user` can exist on an Express request
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
