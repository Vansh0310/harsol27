import type { BusinessCategory, LeadStatus, Prisma } from '../../generated/prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateLeadRecord {
  fullName: string;
  phoneNumber: string;
  email: string;
  businessCategory: BusinessCategory;
  industryId: string;
  sourceIp: string | null;
  userAgent: string | null;
}

export interface CreatedLead {
  id: string;
  createdAt: Date;
}

/**
 * Sole point of contact with the `leads` table for writes. Keeping the
 * Prisma call isolated here means the service layer never needs to know
 * about the ORM, and this is the only file that would change if the
 * persistence layer ever did.
 */
export async function insertLead(data: CreateLeadRecord): Promise<CreatedLead> {
  return prisma.lead.create({
    data,
    select: {
      id: true,
      createdAt: true,
    },
  });
}

export interface LeadIndustryRef {
  id: string;
  name: string;
}

export interface LeadListFilters {
  businessCategory?: BusinessCategory;
  industryId?: string;
  status?: LeadStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface LeadListOptions extends LeadListFilters {
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'fullName' | 'businessCategory' | 'status';
  sortDir: 'asc' | 'desc';
}

export interface LeadSummary {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  businessCategory: BusinessCategory;
  // Null only for leads submitted before this field existed - see the
  // industryId doc comment on the Lead model in schema.prisma.
  industry: LeadIndustryRef | null;
  status: LeadStatus;
  createdAt: Date;
}

export interface LeadListResult {
  leads: LeadSummary[];
  total: number;
}

function buildWhere(filters: LeadListFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (filters.businessCategory) where.businessCategory = filters.businessCategory;
  if (filters.industryId) where.industryId = filters.industryId;
  if (filters.status) where.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  return where;
}

/**
 * Paginated, filtered, sorted listing for the admin dashboard. Count and
 * page are fetched in one round trip via `$transaction` so the total always
 * reflects the same snapshot the returned rows came from (a filter change
 * between two separate queries could otherwise show a total that doesn't
 * match what's on the page).
 */
export async function listLeads(options: LeadListOptions): Promise<LeadListResult> {
  const where = buildWhere(options);
  const select = {
    id: true,
    fullName: true,
    phoneNumber: true,
    email: true,
    businessCategory: true,
    industry: { select: { id: true, name: true } },
    status: true,
    createdAt: true,
  } as const;

  const [leads, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select,
      orderBy: { [options.sortBy]: options.sortDir },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return { leads, total };
}

export interface LeadStatusHistoryEntry {
  id: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  createdAt: Date;
  changedBy: { id: string; email: string };
}

export interface LeadDetail {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  businessCategory: BusinessCategory;
  industry: LeadIndustryRef | null;
  status: LeadStatus;
  // Only ever surfaced here, to an authenticated admin - never on the
  // public API - per the schema's own "abuse investigation only" comment.
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: LeadStatusHistoryEntry[];
}

export async function findLeadById(id: string): Promise<LeadDetail | null> {
  return prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      phoneNumber: true,
      email: true,
      businessCategory: true,
      industry: { select: { id: true, name: true } },
      status: true,
      sourceIp: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          createdAt: true,
          changedBy: { select: { id: true, email: true } },
        },
      },
    },
  });
}

export interface UpdateLeadStatusResult {
  lead: LeadDetail;
  changed: boolean;
}

/**
 * Updates a lead's status and appends one audit-trail row, atomically - a
 * status update should never land without a matching history entry, or vice
 * versa. A no-op (status unchanged) is treated as success without writing a
 * redundant history row, so re-submitting the same status from a stale
 * admin UI tab doesn't pollute the audit log.
 */
export async function updateLeadStatus(
  leadId: string,
  adminUserId: string,
  toStatus: LeadStatus,
): Promise<UpdateLeadStatusResult | null> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    if (!current) {
      return null;
    }

    if (current.status === toStatus) {
      const lead = await findLeadByIdTx(tx, leadId);
      return lead ? { lead, changed: false } : null;
    }

    await tx.lead.update({ where: { id: leadId }, data: { status: toStatus } });
    await tx.leadStatusHistory.create({
      data: {
        leadId,
        adminUserId,
        fromStatus: current.status,
        toStatus,
      },
    });

    const lead = await findLeadByIdTx(tx, leadId);
    return lead ? { lead, changed: true } : null;
  });
}

async function findLeadByIdTx(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LeadDetail | null> {
  return tx.lead.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      phoneNumber: true,
      email: true,
      businessCategory: true,
      industry: { select: { id: true, name: true } },
      status: true,
      sourceIp: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          createdAt: true,
          changedBy: { select: { id: true, email: true } },
        },
      },
    },
  });
}
