import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AdminRole } from '../../generated/prisma/enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AdminRole;
  tokenVersion: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
}

// jsonwebtoken narrows `expiresIn` to a branded string/number union that a
// plain template-literal string doesn't satisfy - a small local cast keeps
// the TTLs driven by env config without fighting that type at every call site.
function minutes(n: number): jwt.SignOptions['expiresIn'] {
  return `${n}m` as jwt.SignOptions['expiresIn'];
}

function days(n: number): jwt.SignOptions['expiresIn'] {
  return `${n}d` as jwt.SignOptions['expiresIn'];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: minutes(env.JWT_ACCESS_TTL_MINUTES),
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: days(env.JWT_REFRESH_TTL_DAYS),
  });
}

/** Returns null instead of throwing - callers treat "invalid" and "expired"
 * identically (both just mean "not authenticated"), so there's no reason to
 * force every call site to wrap this in its own try/catch. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
// Scoped to the one endpoint that reads it, so the long-lived refresh token
// never rides along on the browser's other requests to this API - it's
// simply not attached to any request outside this path.
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth/refresh';

export function accessTokenCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60 * 1000,
    path: '/',
  };
}

export function refreshTokenCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}
