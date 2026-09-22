import { AppError } from '../middleware/errorHandler';
import {
  bumpTokenVersion,
  findAdminByEmail,
  findAdminById,
  recordFailedLogin,
  resetFailedLogins,
  type AdminUserRecord,
} from '../repositories/adminRepository';
import { env } from '../config/env';
import { verifyPassword } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../utils/jwt';

export interface AuthenticatedSession {
  admin: Pick<AdminUserRecord, 'id' | 'email' | 'role'>;
  accessToken: string;
  refreshToken: string;
}

// A real bcrypt hash of a value nobody will ever type, spent on every login
// for an email that doesn't exist. Costs the same ~100ms as a real check,
// so measuring response time can't tell an attacker "no such account" apart
// from "wrong password" - only the (identical) error message can, and it
// deliberately says the same thing either way.
const DUMMY_HASH_FOR_TIMING_SAFETY = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOgxO9x1QRV1Gq8ur.0v6dqbGmM6l6VJC';

function buildTokens(admin: Pick<AdminUserRecord, 'id' | 'email' | 'role' | 'tokenVersion'>): {
  accessToken: string;
  refreshToken: string;
} {
  return {
    accessToken: signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tokenVersion: admin.tokenVersion,
    }),
    refreshToken: signRefreshToken({ sub: admin.id, tokenVersion: admin.tokenVersion }),
  };
}

export async function login(email: string, password: string): Promise<AuthenticatedSession> {
  const admin = await findAdminByEmail(email);

  if (!admin) {
    await verifyPassword(password, DUMMY_HASH_FOR_TIMING_SAFETY);
    throw new AppError(401, 'Invalid email or password.');
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    throw new AppError(
      423,
      'This account is temporarily locked due to repeated failed login attempts. Please try again later.',
    );
  }

  const passwordMatches = await verifyPassword(password, admin.passwordHash);
  if (!passwordMatches) {
    const lockoutUntil = new Date(Date.now() + env.ADMIN_LOGIN_LOCKOUT_MINUTES * 60 * 1000);
    await recordFailedLogin(admin.id, env.ADMIN_LOGIN_MAX_ATTEMPTS, lockoutUntil);
    throw new AppError(401, 'Invalid email or password.');
  }

  await resetFailedLogins(admin.id);

  const { accessToken, refreshToken } = buildTokens(admin);
  return {
    admin: { id: admin.id, email: admin.email, role: admin.role },
    accessToken,
    refreshToken,
  };
}

/**
 * Verifies the refresh token and, if it's still valid for this admin (right
 * signature, not expired, tokenVersion still current), issues a fresh pair.
 * The refresh token itself is rotated too - not strictly required, but it
 * shortens how long a copied refresh token would remain useful if one were
 * ever exfiltrated from storage or logs.
 */
export async function refreshSession(refreshToken: string): Promise<AuthenticatedSession> {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new AppError(401, 'Session expired. Please log in again.');
  }

  const admin = await findAdminById(payload.sub);
  if (!admin || admin.tokenVersion !== payload.tokenVersion) {
    throw new AppError(401, 'Session expired. Please log in again.');
  }

  const tokens = buildTokens(admin);
  return {
    admin: { id: admin.id, email: admin.email, role: admin.role },
    ...tokens,
  };
}

/**
 * Best-effort identification of who's logging out, from whichever cookie is
 * still valid (access or refresh) - an already-expired access token
 * shouldn't stop someone from being able to log out. Bumping tokenVersion
 * invalidates every outstanding token for this admin, not just the one
 * presented; there's no per-device session tracking to do anything finer
 * grained, and for a small admin team that's the right, simple default.
 * Returns silently (nothing to revoke) if neither cookie identifies anyone -
 * logging out is idempotent either way.
 */
export async function logout(
  accessToken: string | undefined,
  refreshToken: string | undefined,
): Promise<void> {
  const adminId =
    (accessToken && verifyAccessToken(accessToken)?.sub) ??
    (refreshToken && verifyRefreshToken(refreshToken)?.sub);

  if (adminId) {
    await bumpTokenVersion(adminId);
  }
}
