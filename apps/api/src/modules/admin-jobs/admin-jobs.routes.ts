import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, JobStatus } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const adminJobsRouter = Router();

adminJobsRouter.get(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as JobStatus | undefined;
      const jobType = req.query.type as string | undefined;

      const jobs = await prisma.backgroundJob.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(jobType ? { jobType } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      res.json(jobs);
    } catch (err) {
      next(err);
    }
  }
);

adminJobsRouter.get(
  '/:jobId',
  authenticate,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = String(req.params.jobId);
      const job = await prisma.backgroundJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        res.status(404).json({ error: `Job '${jobId}' not found` });
        return;
      }

      res.json(job);
    } catch (err) {
      next(err);
    }
  }
);

adminJobsRouter.post(
  '/:jobId/retry',
  authenticate,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = String(req.params.jobId);
      const job = await prisma.backgroundJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        res.status(404).json({ error: `Job '${jobId}' not found` });
        return;
      }

      const updated = await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
          availableAt: new Date(),
          attempts: 0,
          lockToken: null,
          lockedBy: null,
          lockedAt: null
        }
      });

      res.json({
        message: 'Job reset to PENDING and queued for immediate claim',
        job: updated
      });
    } catch (err) {
      next(err);
    }
  }
);
