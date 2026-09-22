import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

/**
 * A factory, matching routes/leads.ts's reasoning: each createApp() call
 * gets its own rate-limit store, so tests that build multiple app instances
 * don't share limiter state.
 */
export function createAuthRouter(): Router {
  const router = Router();

  // IP-based, on top of (not instead of) the per-account lockout in
  // authService.ts - this blunts a scripted flood hitting many different
  // admin emails from one source; the account lockout handles someone
  // grinding through passwords for one specific email.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'rate_limited',
      message: 'Too many login attempts from this address. Please try again later.',
    },
  });

  router.post('/login', loginLimiter, authController.login);
  router.post('/refresh', authController.refresh);
  router.post('/logout', authController.logout);
  router.get('/me', requireAuth, authController.me);

  return router;
}
