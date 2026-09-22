import { AppError } from '../middleware/errorHandler';
import * as leadRepository from '../repositories/leadRepository';
import type { ListLeadsQuery } from '../validators/adminLeads';

export interface PaginatedLeads {
  leads: leadRepository.LeadSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function listLeadsForAdmin(query: ListLeadsQuery): Promise<PaginatedLeads> {
  const { leads, total } = await leadRepository.listLeads(query);

  return {
    leads,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getLeadForAdmin(id: string): Promise<leadRepository.LeadDetail> {
  const lead = await leadRepository.findLeadById(id);
  if (!lead) {
    throw new AppError(404, 'Lead not found.');
  }
  return lead;
}

export async function updateLeadStatusForAdmin(
  leadId: string,
  adminUserId: string,
  toStatus: leadRepository.LeadDetail['status'],
): Promise<leadRepository.LeadDetail> {
  const result = await leadRepository.updateLeadStatus(leadId, adminUserId, toStatus);
  if (!result) {
    throw new AppError(404, 'Lead not found.');
  }
  return result.lead;
}
