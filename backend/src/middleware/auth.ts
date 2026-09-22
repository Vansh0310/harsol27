import type { NextFunction, Request, Response } from 'express';
import { findAdminById } from '../repositories/adminRepository';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from '../utils/jwt';

/**
 * Protects every admin route. Verifies the access token cookie's signature
 * and expiry, then checks its tokenVersion claim against the current value
 * in the database - the one piece a JWT can't self-invalidate. A mismatch
 * means the admin logged out (or was logged out) since this token was
 * issued, so it's treated exactly like an expired one: a plain 401, which
 * the frontend responds to by trying a silent refresh before giving up.
 *
 * Deliberately not distinguishing "no cookie" / "expired" / "revoked" in the
 * response body - a protected endpoint should never help an attacker learn
 * which case they're in.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    return;
  }

  const admin = await findAdminById(payload.sub);
  if (!admin || admin.tokenVersion !== payload.tokenVersion) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    return;
  }

  req.admin = { id: admin.id, email: admin.email, role: admin.role };
  next();
}
