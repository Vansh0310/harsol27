import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * A known, expected application error with a specific HTTP status.
 * Route/service code should throw this instead of a raw Error whenever the
 * failure has a clear, safe-to-share cause (not found, unauthorized, etc.).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Centralized error handler. This is the ONLY place a response error body is
 * constructed - no route should ever send a raw error, stack trace, or driver
 * error message to a client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      message: 'One or more fields are invalid.',
      fields: err.flatten().fieldErrors,
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, err.message);
    }
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      requestId,
    });
    return;
  }

  // Anything else is unexpected: log full detail server-side, tell the client nothing internal.
  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: 'internal_server_error',
    message: 'Something went wrong. Please try again later.',
    requestId,
  });
};
