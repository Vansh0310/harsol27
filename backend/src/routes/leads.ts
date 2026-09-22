import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createLead } from '../controllers/leadController';
import * as adminLeadController from '../controllers/adminLeadController';
import { requireAuth } from '../middleware/auth';
import { env } from '../config/env';

/**
 * A factory (not a module-level singleton) so every createApp() call gets
 * its own rate-limit store - matters for tests that build multiple app
 * instances, and keeps the app free of any shared mutable state at import time.
 *
 * One router mixes the public write path with the admin-only read/update
 * paths, matching the plan doc's endpoint table (GET /api/leads and
 * GET /api/leads/:id sit on the same base path as the public POST, just
 * behind auth) rather than a separate /api/admin/leads namespace.
 */
export function createLeadsRouter(): Router {
  const router = Router();

  const submitLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'rate_limited',
      message: 'Too many submissions from this address. Please try again later.',
    },
  });

  router.post('/', submitLimiter, createLead);

  router.get('/', requireAuth, adminLeadController.list);
  router.get('/:id', requireAuth, adminLeadController.getById);
  router.patch('/:id/status', requireAuth, adminLeadController.updateStatus);

  return router;
}
