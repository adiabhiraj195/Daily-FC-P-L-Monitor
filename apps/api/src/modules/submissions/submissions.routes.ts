import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, JobStatus } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { triggerAIInvestigationForAnomaly } from '../../services/ai-investigation.service.js';

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

      if (
        req.user!.role === UserRole.FC_MANAGER &&
        !req.user!.assignedFcIds.includes(submission.fcId)
      ) {
        res.status(403).json({ error: 'Forbidden: you do not have permission for this FC' });
        return;
      }

      // Verify all 3 files are uploaded
      const [operationsRecord, laborRecord] = await Promise.all([
        prisma.operationalDailyMetrics.findFirst({
          where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
        }),
        prisma.workforceDailyMetrics.findFirst({
          where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
        })
      ]);

      const hasPnl = !!submission.pnl;
      const hasOperations = !!operationsRecord;
      const hasLabor = !!laborRecord;

      if (!hasPnl || !hasOperations || !hasLabor) {
        const missing: string[] = [];
        if (!hasPnl) missing.push('Financial P&L');
        if (!hasOperations) missing.push('Daily Operations');
        if (!hasLabor) missing.push('Daily Labor');

        res.status(400).json({
          error: `Cannot trigger AI investigation: all three files (Financial P&L, Daily Operations, and Daily Labor) must be uploaded first. Missing: ${missing.join(', ')}`,
          missingFiles: missing,
          hasPnl,
          hasOperations,
          hasLabor
        });
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
        message: 'AI investigation queued for processing',
        submissionId: submission.id,
        jobId: job.id
      });
    } catch (err) {
      next(err);
    }
  }
);

submissionsRouter.post(
  '/:submissionId/trigger-ai',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const submissionId = String(req.params.submissionId);

      const submission = await prisma.dailySubmission.findUnique({
        where: { id: submissionId },
        include: { pnl: { include: { anomalies: true } } }
      });

      if (!submission || !submission.pnl) {
        res.status(404).json({ error: `Submission or PnL not found for '${submissionId}'` });
        return;
      }

      if (
        req.user!.role === UserRole.FC_MANAGER &&
        !req.user!.assignedFcIds.includes(submission.fcId)
      ) {
        res.status(403).json({ error: 'Forbidden: you do not have permission for this FC' });
        return;
      }

      // Check first anomaly ID if available to use triggerAIInvestigationForAnomaly
      const anomaly = submission.pnl.anomalies[0];
      if (anomaly) {
        const result = await triggerAIInvestigationForAnomaly(
          prisma,
          anomaly.id,
          req.user!.id,
          req.user!.role,
          req.user!.assignedFcIds
        );
        res.json(result);
        return;
      }

      // Fallback: verify all 3 files and queue job
      const [operationsRecord, laborRecord] = await Promise.all([
        prisma.operationalDailyMetrics.findFirst({
          where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
        }),
        prisma.workforceDailyMetrics.findFirst({
          where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
        })
      ]);

      const hasPnl = !!submission.pnl;
      const hasOperations = !!operationsRecord;
      const hasLabor = !!laborRecord;

      if (!hasPnl || !hasOperations || !hasLabor) {
        const missing: string[] = [];
        if (!hasPnl) missing.push('Financial P&L');
        if (!hasOperations) missing.push('Daily Operations');
        if (!hasLabor) missing.push('Daily Labor');

        res.status(400).json({
          error: `Cannot trigger AI investigation: all three files (Financial P&L, Daily Operations, and Daily Labor) must be uploaded first. Missing: ${missing.join(', ')}`,
          missingFiles: missing,
          hasPnl,
          hasOperations,
          hasLabor
        });
        return;
      }

      const promptVersion = Date.now();
      const idempotencyKey = `trigger-ai:${submission.id}:${promptVersion}`;

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
        message: 'AI investigation queued successfully',
        submissionId: submission.id,
        jobId: job.id
      });
    } catch (err: any) {
      if (err.status) {
        res.status(err.status).json({ error: err.message, missingFiles: err.missingFiles });
      } else if (err.message && (err.message.includes('all three files') || err.message.includes('must be uploaded'))) {
        res.status(400).json({ error: err.message, missingFiles: err.missingFiles });
      } else {
        next(err);
      }
    }
  }
);
