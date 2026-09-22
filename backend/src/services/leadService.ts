import { insertLead } from '../repositories/leadRepository';
import type { CreateLeadInput } from '../validators/lead';
import { notifyNewLead } from './emailService';
import { logger } from '../utils/logger';

export interface SubmitLeadContext {
  ip: string | null;
  userAgent: string | null;
}

export interface SubmitLeadResult {
  id: string;
  createdAt: Date;
}

/**
 * Business logic for a new public submission: persist it, then fire the
 * Phase 5 email notifications (confirmation to the submitter, alert to
 * admin/sales) as a background job. The notification promise is
 * deliberately not awaited before we return - a slow or down email
 * provider must never delay or fail this response, since the lead is
 * already safely committed to the database at that point. notifyNewLead
 * itself never throws (see emailService.ts), but the .catch below is
 * defense-in-depth against that contract ever changing.
 */
export async function submitLead(
  input: CreateLeadInput,
  context: SubmitLeadContext,
): Promise<SubmitLeadResult> {
  const lead = await insertLead({
    fullName: input.fullName,
    phoneNumber: input.phoneNumber,
    email: input.email,
    businessCategory: input.businessCategory,
    sourceIp: context.ip,
    userAgent: context.userAgent,
  });

  void notifyNewLead({
    id: lead.id,
    fullName: input.fullName,
    phoneNumber: input.phoneNumber,
    email: input.email,
    businessCategory: input.businessCategory,
    createdAt: lead.createdAt,
  }).catch((err: unknown) => {
    logger.error({ err, leadId: lead.id }, 'Lead notification emails failed unexpectedly');
  });

  return lead;
}
