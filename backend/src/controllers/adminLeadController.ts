import type { Request, Response } from 'express';
import * as adminLeadService from '../services/adminLeadService';
import { listLeadsQuerySchema, updateLeadStatusSchema } from '../validators/adminLeads';
import { AppError } from '../middleware/errorHandler';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listLeadsQuerySchema.parse(req.query);
  const result = await adminLeadService.listLeadsForAdmin(query);
  res.status(200).json(result);
}

export async function getById(req: Request<{ id: string }>, res: Response): Promise<void> {
  const lead = await adminLeadService.getLeadForAdmin(req.params.id);
  res.status(200).json({ lead });
}

export async function updateStatus(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { status } = updateLeadStatusSchema.parse(req.body);

  // requireAuth guarantees req.admin is set before this handler runs
  // (see routes/leads.ts) - the non-null assertion documents that contract
  // rather than silently trusting an untyped access.
  if (!req.admin) {
    throw new AppError(401, 'Authentication required.');
  }

  const lead = await adminLeadService.updateLeadStatusForAdmin(req.params.id, req.admin.id, status);
  res.status(200).json({ lead });
}
