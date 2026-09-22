import type { AdminRole } from '../../generated/prisma/enums';
import { prisma } from '../lib/prisma';

export interface AdminUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  tokenVersion: number;
}

const ADMIN_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  tokenVersion: true,
} as const;

export async function findAdminByEmail(email: string): Promise<AdminUserRecord | null> {
  return prisma.adminUser.findUnique({ where: { email }, select: ADMIN_SELECT });
}

export async function findAdminById(id: string): Promise<AdminUserRecord | null> {
  return prisma.adminUser.findUnique({ where: { id }, select: ADMIN_SELECT });
}

/**
 * Records one failed password attempt and, once `maxAttempts` is reached,
 * locks the account until `lockoutUntil`. Done as a single atomic update
 * (increment + conditional set) rather than read-then-write, so two
 * concurrent failed requests for the same account can't race past the
 * threshold without either one seeing the lock.
 */
export async function recordFailedLogin(
  id: string,
  maxAttempts: number,
  lockoutUntil: Date,
): Promise<void> {
  const updated = await prisma.adminUser.update({
    where: { id },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (updated.failedLoginAttempts >= maxAttempts) {
    await prisma.adminUser.update({
      where: { id },
      data: { lockedUntil: lockoutUntil },
    });
  }
}

export async function resetFailedLogins(id: string): Promise<void> {
  await prisma.adminUser.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

/** Invalidates every access/refresh token issued before this call for this
 * admin (see tokenVersion's doc comment in schema.prisma). */
export async function bumpTokenVersion(id: string): Promise<number> {
  const updated = await prisma.adminUser.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return updated.tokenVersion;
}

export interface CreateAdminInput {
  email: string;
  passwordHash: string;
  role: AdminRole;
}

/** Used only by scripts/create-admin.ts - there is no public registration
 * endpoint, deliberately (see the plan doc's Admin Dashboard section). */
export async function upsertAdmin(data: CreateAdminInput): Promise<AdminUserRecord> {
  return prisma.adminUser.upsert({
    where: { email: data.email },
    create: data,
    update: { passwordHash: data.passwordHash, role: data.role },
    select: ADMIN_SELECT,
  });
}
