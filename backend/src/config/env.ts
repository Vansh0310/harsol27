import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(10),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().positive().default(5),

  // Transactional email (Phase 5). Only 'resend' is implemented today; the
  // provider name is still validated/stored so a future provider can be
  // added as an isolated adapter in emailService.ts without touching env
  // parsing anywhere else.
  EMAIL_PROVIDER: z.enum(['resend']).default('resend'),
  EMAIL_API_KEY: z.string().min(1, 'EMAIL_API_KEY is required'),
  // Format accepted by Resend: a bare address or "Display Name <address>".
  EMAIL_FROM: z.string().min(3, 'EMAIL_FROM is required'),
  ADMIN_NOTIFICATION_EMAIL: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('ADMIN_NOTIFICATION_EMAIL must be a valid email address.')),

  // Admin auth (Phase 6). Kept short-lived by design: the access token is
  // what every protected request is authorized against, so a stolen one
  // should go stale fast; the frontend silently exchanges it for a new one
  // via the refresh token, which lives much longer but only ever touches
  // /api/auth/refresh.
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().positive().default(7),
  // After this many consecutive failed password attempts, the account is
  // locked (not just rate-limited) for ADMIN_LOGIN_LOCKOUT_MINUTES, so a
  // slow distributed brute force can't just outlast an IP-based limiter.
  ADMIN_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ADMIN_LOGIN_LOCKOUT_MINUTES: z.coerce.number().positive().default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud: a misconfigured production service should never boot silently.
  console.error(
    'Invalid environment configuration:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
