import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../lib/prisma';

export interface IndustryRecord {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const INDUSTRY_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Public form dropdown - active only, in display order. */
export async function listActiveIndustries(): Promise<IndustryRecord[]> {
  return prisma.industry.findMany({
    where: { isActive: true },
    select: INDUSTRY_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Admin management screen - every industry, active or not. */
export async function listAllIndustries(): Promise<IndustryRecord[]> {
  return prisma.industry.findMany({
    select: INDUSTRY_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function findIndustryById(id: string): Promise<IndustryRecord | null> {
  return prisma.industry.findUnique({ where: { id }, select: INDUSTRY_SELECT });
}

/**
 * True only for an id that exists AND is active - the one check that
 * matters before accepting a public lead submission, since an id that's
 * merely well-formed could still name an industry an admin has since
 * deactivated (or that never existed at all).
 */
export async function isActiveIndustryId(id: string): Promise<boolean> {
  const industry = await prisma.industry.findUnique({
    where: { id },
    select: { isActive: true },
  });
  return industry?.isActive === true;
}

export interface CreateIndustryInput {
  name: string;
  slug: string;
  sortOrder: number;
}

/**
 * Unique-constraint violations (duplicate name or slug) surface as Prisma's
 * P2002 rather than a thrown application error - translated to AppError by
 * the caller (industryService), which knows which field to blame in the
 * message. Keeping that translation out of this file keeps the repository
 * layer a thin, error-code-agnostic wrapper around Prisma, matching every
 * other repository in this codebase.
 */
export async function createIndustry(data: CreateIndustryInput): Promise<IndustryRecord> {
  return prisma.industry.create({ data, select: INDUSTRY_SELECT });
}

export interface UpdateIndustryInput {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function updateIndustry(
  id: string,
  data: UpdateIndustryInput,
): Promise<IndustryRecord | null> {
  try {
    return await prisma.industry.update({ where: { id }, data, select: INDUSTRY_SELECT });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}
