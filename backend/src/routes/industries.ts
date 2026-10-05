import { Router } from 'express';
import * as industryController from '../controllers/industryController';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Same shape as routes/leads.ts: one router mixing the public read path
 * with the admin-only read/write paths on a shared base path, rather than
 * a separate /api/admin namespace.
 *
 * Write access (create/update) is restricted to the 'admin' role - a
 * 'viewer' can see the full list (including inactive rows) same as any
 * authenticated admin, but can't add, rename, reorder, or deactivate one.
 */
export function createIndustriesRouter(): Router {
  const router = Router();

  router.get('/', industryController.listActive);
  router.get('/all', requireAuth, industryController.listAll);
  router.post('/', requireAuth, requireRole('admin'), industryController.create);
  router.patch('/:id', requireAuth, requireRole('admin'), industryController.update);

  return router;
}
