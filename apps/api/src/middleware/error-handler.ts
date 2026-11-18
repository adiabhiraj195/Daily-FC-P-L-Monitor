import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      requestId,
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[API Error ${requestId}] ${statusCode} - ${message}`, err.stack || err);

  res.status(statusCode).json({
    error: message,
    requestId
  });
}
