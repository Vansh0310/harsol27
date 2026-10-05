import type { Request, Response } from 'express';
import * as industryService from '../services/industryService';
import { createIndustrySchema, updateIndustrySchema } from '../validators/industry';

/** GET /api/industries - public, active only. Feeds the lead form's dropdown. */
export async function listActive(_req: Request, res: Response): Promise<void> {
  const industries = await industryService.listActiveIndustries();
  res.status(200).json({ industries });
}

/** GET /api/industries/all - admin (any role). Feeds the management screen. */
export async function listAll(_req: Request, res: Response): Promise<void> {
  const industries = await industryService.listAllIndustriesForAdmin();
  res.status(200).json({ industries });
}

/** POST /api/industries - admin role only. */
export async function create(req: Request, res: Response): Promise<void> {
  const { name } = createIndustrySchema.parse(req.body);
  const industry = await industryService.createIndustry(name);
  res.status(201).json({ industry });
}

/** PATCH /api/industries/:id - admin role only. */
export async function update(req: Request<{ id: string }>, res: Response): Promise<void> {
  const input = updateIndustrySchema.parse(req.body);
  const industry = await industryService.updateIndustry(req.params.id, input);
  res.status(200).json({ industry });
}
