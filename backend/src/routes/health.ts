import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness check only (no DB dependency) so the hosting platform's health
 * probe never fails just because the database is briefly unreachable -
 * that distinction (liveness vs readiness) matters once this is deployed
 * behind a load balancer that restarts unhealthy instances.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
