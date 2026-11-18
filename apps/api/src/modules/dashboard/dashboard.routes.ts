import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, SubmissionStatus, ReviewStatus } from '@prisma/client';
import { calculateWeightedAggregates } from '@prozo/finance';
import { authenticate } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const dashboardRouter = Router();

dashboardRouter.get(
  '/summary',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0]!;
      const businessDate = new Date(dateStr);

      const fcFilter =
        req.user!.role === UserRole.FC_MANAGER
          ? { id: { in: req.user!.assignedFcIds }, isActive: true }
          : { isActive: true };

      const activeFcs = await prisma.fulfilmentCentre.findMany({
        where: fcFilter
      });
      const fcIds = activeFcs.map(f => f.id);

      // Fetch latest submissions for this date
      const submissions = await prisma.dailySubmission.findMany({
        where: {
          fcId: { in: fcIds },
          businessDate,
          isLatest: true
        },
        include: {
          pnl: {
            include: {
              anomalies: true
            }
          }
        }
      });

      const totalActiveFcs = activeFcs.length;
      let receivedCount = 0;
      let missingCount = 0;
      let invalidCount = 0;
      const colourCounts = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
      const pnlsForAggregation: Array<{ revenue: string; cm1: string; cm2: string }> = [];
      let openAnomaliesCount = 0;

      const submissionMap = new Map(submissions.map(s => [s.fcId, s]));

      for (const fc of activeFcs) {
        const sub = submissionMap.get(fc.id);
        if (!sub || sub.status === SubmissionStatus.MISSING) {
          missingCount++;
        } else if (sub.status === SubmissionStatus.INVALID || sub.status === SubmissionStatus.FAILED) {
          invalidCount++;
        } else {
          receivedCount++;
          if (sub.pnl) {
            colourCounts[sub.pnl.colour]++;
            pnlsForAggregation.push({
              revenue: sub.pnl.revenue.toString(),
              cm1: sub.pnl.cm1.toString(),
              cm2: sub.pnl.cm2.toString()
            });

            // Count open anomalies
            const unreviewed = sub.pnl.anomalies.filter(
              a => a.reviewStatus === ReviewStatus.PENDING || a.reviewStatus === ReviewStatus.NEEDS_INVESTIGATION
            );
            openAnomaliesCount += unreviewed.length;
          }
        }
      }

      const aggregates = calculateWeightedAggregates(pnlsForAggregation);

      res.json({
        date: dateStr,
        activeFcsCount: totalActiveFcs,
        receivedCount,
        missingCount,
        invalidCount,
        colourCounts,
        aggregates: {
          totalRevenue: aggregates.totalRevenue,
          weightedCM1Pct: aggregates.weightedCM1Pct,
          weightedCM2Pct: aggregates.weightedCM2Pct
        },
        openAnomaliesCount
      });
    } catch (err) {
      next(err);
    }
  }
);

dashboardRouter.get(
  '/fc-status',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0]!;
      const businessDate = new Date(dateStr);

      const fcFilter =
        req.user!.role === UserRole.FC_MANAGER
          ? { id: { in: req.user!.assignedFcIds }, isActive: true }
          : { isActive: true };

      const fcs = await prisma.fulfilmentCentre.findMany({
        where: fcFilter,
        include: {
          managers: {
            include: { user: { select: { name: true, email: true } } }
          },
          submissions: {
            where: { businessDate, isLatest: true },
            include: {
              pnl: {
                include: {
                  anomalies: true
                }
              }
            }
          }
        }
      });

      const list = fcs.map(fc => {
        const sub = fc.submissions[0];
        const manager = fc.managers[0]?.user;

        return {
          fcId: fc.id,
          fcCode: fc.code,
          fcName: fc.name,
          location: fc.location,
          currency: fc.currency,
          manager: manager ? { name: manager.name, email: manager.email } : null,
          submissionStatus: sub ? sub.status : SubmissionStatus.MISSING,
          submissionId: sub?.id || null,
          revenue: sub?.pnl?.revenue ? sub.pnl.revenue.toString() : null,
          cm1Pct: sub?.pnl?.cm1Pct ? sub.pnl.cm1Pct.toString() : null,
          cm2Pct: sub?.pnl?.cm2Pct ? sub.pnl.cm2Pct.toString() : null,
          colour: sub?.pnl?.colour || null,
          anomaliesCount: sub?.pnl?.anomalies ? sub.pnl.anomalies.length : 0
        };
      });

      res.json(list);
    } catch (err) {
      next(err);
    }
  }
);

dashboardRouter.get(
  '/trends',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fromStr = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
      const toStr = (req.query.to as string) || new Date().toISOString().split('T')[0]!;

      const fcFilter =
        req.user!.role === UserRole.FC_MANAGER
          ? { fcId: { in: req.user!.assignedFcIds } }
          : {};

      const submissions = await prisma.dailySubmission.findMany({
        where: {
          ...fcFilter,
          businessDate: {
            gte: new Date(fromStr),
            lte: new Date(toStr)
          },
          isLatest: true,
          status: SubmissionStatus.COMPLETED
        },
        include: {
          pnl: true
        },
        orderBy: { businessDate: 'asc' }
      });

      // Group by date
      const byDate = new Map<string, Array<{ revenue: string; cm1: string; cm2: string }>>();
      for (const s of submissions) {
        if (!s.pnl) continue;
        const d = s.businessDate.toISOString().split('T')[0]!;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push({
          revenue: s.pnl.revenue.toString(),
          cm1: s.pnl.cm1.toString(),
          cm2: s.pnl.cm2.toString()
        });
      }

      const trendData = Array.from(byDate.entries()).map(([date, pnls]) => {
        const agg = calculateWeightedAggregates(pnls);
        return {
          date,
          totalRevenue: agg.totalRevenue,
          weightedCM1Pct: agg.weightedCM1Pct,
          weightedCM2Pct: agg.weightedCM2Pct
        };
      });

      res.json(trendData);
    } catch (err) {
      next(err);
    }
  }
);
