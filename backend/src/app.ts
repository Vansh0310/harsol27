import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { createAuthRouter } from './routes/auth';
import { createIndustriesRouter } from './routes/industries';
import { createLeadsRouter } from './routes/leads';
import { healthRouter } from './routes/health';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Required so req.ip and the rate limiter see the real client IP when this
  // sits behind a hosting platform's load balancer/reverse proxy in production.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // CSP is meaningful once we know the exact origins the frontend loads
      // assets from; left off in dev, tightened before this serves real traffic.
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  // Small body limit: this API only ever accepts a handful of short form fields.
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  // Baseline rate limit across the whole API; the public submit endpoint gets
  // its own stricter limit on top of this once it exists (Phase 3).
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use('/health', healthRouter);
  app.use('/api/auth', createAuthRouter());
  app.use('/api/leads', createLeadsRouter());
  app.use('/api/industries', createIndustriesRouter());

  app.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: `No route for ${req.method} ${req.path}`,
    });
  });

  // Must be registered last: Express only treats a 4-arg handler as an error handler.
  app.use(errorHandler);

  return app;
}
