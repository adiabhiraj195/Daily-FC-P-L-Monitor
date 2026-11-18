import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { config } from './config/index.js';

const prisma = new PrismaClient();

export function createApp(): Express {
  const app = express();

  // CORS
  app.use(
    cors({
      origin: [config.WEB_URL, 'http://localhost:3000'],
      credentials: true
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Request ID middleware
  app.use((req: Request, _res: Response, next) => {
    req.requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    next();
  });

  // Health checks
  app.get('/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'live', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err: any) {
      res.status(503).json({ status: 'not ready', database: 'disconnected', error: err.message });
    }
  });

  // REST API routes under /api/v1
  app.use('/api/v1', apiRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
