import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, JobStatus } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const submissionsRouter = Router();

submissionsRouter.post(
  '/:submissionId/reprocess',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.FINANCE]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const submissionId = String(req.params.submissionId);
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Reprocessing requires a mandatory reason' });
        return;
      }

      const submission = await prisma.dailySubmission.findUnique({
        where: { id: submissionId }
      });

      if (!submission) {
        res.status(404).json({ error: `Submission '${submissionId}' not found` });
        return;
      }

      // Schedule new analysis job
      const calcVersion = Date.now();
      const idempotencyKey = `reprocess:${submission.id}:${calcVersion}`;

      const job = await prisma.backgroundJob.create({
        data: {
          jobType: 'ANALYZE_SUBMISSION',
          payload: { submissionId: submission.id, calcVersion, reason, triggeredById: req.user!.id },
          status: JobStatus.PENDING,
          priority: 8,
          idempotencyKey,
          maxAttempts: 3
        }
      });

      res.json({
        message: 'Submission queued for reprocessing',
        submissionId: submission.id,
        jobId: job.id
      });
    } catch (err) {
      next(err);
    }
  }
);

submissionsRouter.post(
  '/:submissionId/retry-ai',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.FINANCE]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const submissionId = String(req.params.submissionId);

      const submission = await prisma.dailySubmission.findUnique({
        where: { id: submissionId },
        include: { pnl: true }
      });

      if (!submission || !submission.pnl) {
        res.status(404).json({ error: `Submission or PnL not found for '${submissionId}'` });
        return;
      }

      const promptVersion = Date.now();
      const idempotencyKey = `retry-ai:${submission.id}:${promptVersion}`;

      const job = await prisma.backgroundJob.create({
        data: {
          jobType: 'GENERATE_AI_REPORT',
          payload: { submissionId: submission.id, force: true, triggeredById: req.user!.id },
          status: JobStatus.PENDING,
          priority: 8,
          idempotencyKey,
          maxAttempts: 2
        }
      });

      res.json({
        message: 'AI investigation queued for retry',
        submissionId: submission.id,
        jobId: job.id
      });
    } catch (err) {
      next(err);
    }
  }
);
