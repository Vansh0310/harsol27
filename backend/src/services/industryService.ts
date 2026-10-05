import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../middleware/errorHandler';
import * as industryRepository from '../repositories/industryRepository';
import type { IndustryRecord } from '../repositories/industryRepository';

export type { IndustryRecord };

export async function listActiveIndustries(): Promise<IndustryRecord[]> {
  return industryRepository.listActiveIndustries();
}

export async function listAllIndustriesForAdmin(): Promise<IndustryRecord[]> {
  return industryRepository.listAllIndustries();
}

/**
 * Lowercase, hyphen-separated identifier derived from a display name -
 * "Steel & Metal Products" -> "steel-metal-products". Collisions (two
 * different names producing the same slug, e.g. differing only in
 * punctuation) are caught by the database's unique constraint on `slug` and
 * surfaced as a 409, same as a duplicate name.
 */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Translates Prisma's unique-constraint violation into a message naming
 * whichever field actually collided, rather than a generic "already exists". */
function throwIfUniqueConstraintViolation(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'name';
    throw new AppError(409, `An industry with this ${target} already exists.`);
  }
  throw err;
}

export async function createIndustry(name: string): Promise<IndustryRecord> {
  const slug = slugify(name);
  if (!slug) {
    throw new AppError(400, 'Enter a name with at least one letter or number.');
  }

  // New industries are appended after the current highest sortOrder (in the
  // same +10 steps the seed uses) so they land at the end of both dropdowns
  // by default; an admin can still drag/renumber them via updateIndustry.
  const existing = await industryRepository.listAllIndustries();
  const maxSortOrder = existing.reduce((max, industry) => Math.max(max, industry.sortOrder), 0);

  try {
    return await industryRepository.createIndustry({
      name: name.trim(),
      slug,
      sortOrder: maxSortOrder + 10,
    });
  } catch (err) {
    throwIfUniqueConstraintViolation(err);
  }
}

export interface UpdateIndustryInput {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function updateIndustry(
  id: string,
  input: UpdateIndustryInput,
): Promise<IndustryRecord> {
  const data: industryRepository.UpdateIndustryInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  try {
    const updated = await industryRepository.updateIndustry(id, data);
    if (!updated) {
      throw new AppError(404, 'Industry not found.');
    }
    return updated;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throwIfUniqueConstraintViolation(err);
  }
}
