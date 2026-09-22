import type { Request, Response } from 'express';
import * as authService from '../services/authService';
import { loginSchema } from '../validators/auth';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '../utils/jwt';

function setSessionCookies(
  res: Response,
  session: { accessToken: string; refreshToken: string },
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, accessTokenCookieOptions());
  res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshTokenCookieOptions());
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);
  const session = await authService.login(email, password);

  setSessionCookies(res, session);
  res.status(200).json({ admin: session.admin });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (!token) {
    res
      .status(401)
      .json({ error: 'unauthorized', message: 'Session expired. Please log in again.' });
    return;
  }

  const session = await authService.refreshSession(token);
  setSessionCookies(res, session);
  res.status(200).json({ admin: session.admin });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

  await authService.logout(accessToken, refreshToken);

  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
  res.status(200).json({ message: 'Logged out.' });
}

export function me(req: Request, res: Response): void {
  // requireAuth has already run and populated req.admin by the time this
  // handler is reached - see routes/auth.ts.
  res.status(200).json({ admin: req.admin });
}
