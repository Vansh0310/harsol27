import bcrypt from 'bcrypt';

// 12 rounds is a reasonable balance of security and login latency for an
// admin-only login path (as of 2026 hardware) - higher than bcrypt's old
// default of 10, but not so high it makes every login noticeably slow.
const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
