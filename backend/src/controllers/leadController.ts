import type { Request, Response } from 'express';
import { submitLead } from '../services/leadService';
import { createLeadSchema } from '../validators/lead';

const HONEYPOT_RESPONSE = { id: 'ok', createdAt: new Date(0).toISOString() };

/**
 * POST /api/leads - the only write path for public form submissions.
 * Validation errors throw a ZodError, caught by the centralized error
 * handler (Express 5 forwards a rejected async-handler promise automatically
 * - no try/catch or extra middleware needed here).
 */
export async function createLead(req: Request, res: Response): Promise<void> {
  const parsed = createLeadSchema.parse(req.body);

  if (parsed.companyWebsite) {
    // Honeypot tripped: respond exactly like a real success so a scraper
    // never learns which field gave it away, but never touch the database.
    res.status(201).json(HONEYPOT_RESPONSE);
    return;
  }

  const lead = await submitLead(parsed, {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });

  res.status(201).json({
    id: lead.id,
    createdAt: lead.createdAt,
  });
}
