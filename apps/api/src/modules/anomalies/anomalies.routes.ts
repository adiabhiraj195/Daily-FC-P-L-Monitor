import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, ReviewStatus } from '@prisma/client';
import { anomalyReviewSchema } from '@prozo/shared';
import { authenticate } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const anomaliesRouter = Router();

anomaliesRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        type,
        severity,
        reviewStatus,
        fcId,
        startDate,
        endDate,
        from,
        to,
        metricKey
      } = req.query;

      const start = (startDate || from) as string | undefined;
      const end = (endDate || to) as string | undefined;

      const submissionWhere: any = { isLatest: true };

      if (req.user!.role === UserRole.FC_MANAGER) {
        if (fcId) {
          const reqFcId = String(fcId);
          if (req.user!.assignedFcIds.includes(reqFcId)) {
            submissionWhere.fcId = reqFcId;
          } else {
            submissionWhere.fcId = { in: [] };
          }
        } else {
          submissionWhere.fcId = { in: req.user!.assignedFcIds };
        }
      } else if (fcId) {
        submissionWhere.fcId = String(fcId);
      }

      if (start || end) {
        submissionWhere.businessDate = {};
        if (start) {
          submissionWhere.businessDate.gte = new Date(start);
        }
        if (end) {
          const endDateObj = new Date(end);
          if (end.length <= 10) {
            endDateObj.setHours(23, 59, 59, 999);
          }
          submissionWhere.businessDate.lte = endDateObj;
        }
      }

      const whereClause: any = {
        dailyPnl: {
          submission: submissionWhere
        }
      };

      if (type) {
        whereClause.type = String(type);
      }
      if (severity) {
        whereClause.severity = String(severity);
      }
      if (reviewStatus) {
        whereClause.reviewStatus = String(reviewStatus);
      }
      if (metricKey) {
        whereClause.metricKey = String(metricKey);
      }

      const anomalies = await prisma.anomaly.findMany({
        where: whereClause,
        include: {
          dailyPnl: {
            include: {
              submission: {
                select: {
                  businessDate: true,
                  fc: { select: { id: true, code: true, name: true, location: true } }
                }
              },
              aiReport: true
            }
          },
          reviews: {
            include: { actor: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 300
      });

      res.json(anomalies);
    } catch (err) {
      next(err);
    }
  }
);

anomaliesRouter.get(
  '/:anomalyId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const anomalyId = String(req.params.anomalyId);
      const anomaly = await prisma.anomaly.findUnique({
        where: { id: anomalyId },
        include: {
          dailyPnl: {
            include: {
              submission: {
                include: { fc: true }
              },
              costLines: true,
              aiReport: true
            }
          },
          reviews: {
            include: { actor: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!anomaly) {
        res.status(404).json({ error: `Anomaly '${anomalyId}' not found` });
        return;
      }

      // Check FC access
      if (
        req.user!.role === UserRole.FC_MANAGER &&
        !req.user!.assignedFcIds.includes(anomaly.dailyPnl.submission.fcId)
      ) {
        res.status(403).json({ error: 'Forbidden: you do not have access to this anomaly' });
        return;
      }

      res.json(anomaly);
    } catch (err) {
      next(err);
    }
  }
);

anomaliesRouter.patch(
  '/:anomalyId/review',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const anomalyId = String(req.params.anomalyId);
      const parsed = anomalyReviewSchema.parse(req.body);

      const anomaly = await prisma.anomaly.findUnique({
        where: { id: anomalyId },
        include: { dailyPnl: { include: { submission: true } } }
      });

      if (!anomaly) {
        res.status(404).json({ error: `Anomaly '${anomalyId}' not found` });
        return;
      }

      // Check FC access
      if (
        req.user!.role === UserRole.FC_MANAGER &&
        !req.user!.assignedFcIds.includes(anomaly.dailyPnl.submission.fcId)
      ) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Dismissal requires a reason per Section 7.2 & 10.5
      if (parsed.status === ReviewStatus.DISMISSED && !parsed.reason) {
        res.status(400).json({ error: 'Dismissing an anomaly requires a mandatory reason' });
        return;
      }

      // Transactionally update anomaly and record append-only review event
      const [updatedAnomaly] = await prisma.$transaction([
        prisma.anomaly.update({
          where: { id: anomalyId },
          data: { reviewStatus: parsed.status as any }
        }),
        prisma.anomalyReview.create({
          data: {
            anomalyId: anomaly.id,
            actorId: req.user!.id,
            action: `STATUS_CHANGE_TO_${parsed.status}`,
            reason: parsed.reason,
            comment: parsed.comment
          }
        })
      ]);

      res.json(updatedAnomaly);
    } catch (err) {
      next(err);
    }
  }
);

anomaliesRouter.post(
  '/:anomalyId/notes',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const anomalyId = String(req.params.anomalyId);
      const { note } = req.body;

      if (!note || typeof note !== 'string') {
        res.status(400).json({ error: 'Note text is required' });
        return;
      }

      const anomaly = await prisma.anomaly.findUnique({
        where: { id: anomalyId },
        include: { dailyPnl: { include: { submission: true } } }
      });

      if (!anomaly) {
        res.status(404).json({ error: `Anomaly '${anomalyId}' not found` });
        return;
      }

      const review = await prisma.anomalyReview.create({
        data: {
          anomalyId: anomaly.id,
          actorId: req.user!.id,
          action: 'NOTE_ADDED',
          comment: note
        },
        include: {
          actor: { select: { id: true, name: true, email: true } }
        }
      });

      res.status(201).json(review);
    } catch (err) {
      next(err);
    }
  }
);
