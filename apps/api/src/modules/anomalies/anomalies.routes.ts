import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, ReviewStatus } from '@prisma/client';
import {
  calculateOperationalMetrics,
  calculateWorkforceMetrics,
  calculateProductivityMetrics,
  reconcileContractorCosts,
  evaluateDataCompleteness,
  compareMetricToHistorical
} from '@prozo/finance';
import { anomalyReviewSchema } from '@prozo/shared';
import { authenticate } from '../../middleware/auth.js';
import {
  getPreparedAIInputForAnomaly,
  triggerAIInvestigationForAnomaly
} from '../../services/ai-investigation.service.js';

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

      // Fetch operational & labor data for this FC and date
      const fcId = anomaly.dailyPnl.submission.fcId;
      const businessDate = anomaly.dailyPnl.submission.businessDate;
      const dateStr = businessDate.toISOString().split('T')[0]!;

      const [operations, labor, priorOps, priorLabor] = await Promise.all([
        prisma.operationalDailyMetrics.findFirst({
          where: { fcId, businessDate, isLatest: true }
        }),
        prisma.workforceDailyMetrics.findFirst({
          where: { fcId, businessDate, isLatest: true }
        }),
        prisma.operationalDailyMetrics.findMany({
          where: { fcId, businessDate: { lt: businessDate }, isLatest: true },
          orderBy: { businessDate: 'desc' },
          take: 30
        }),
        prisma.workforceDailyMetrics.findMany({
          where: { fcId, businessDate: { lt: businessDate }, isLatest: true },
          orderBy: { businessDate: 'desc' },
          take: 30
        })
      ]);

      const completeness = evaluateDataCompleteness({
        fcId,
        businessDate: dateStr,
        hasPnl: true,
        hasOperations: !!operations,
        hasLabor: !!labor,
        pnlVersion: anomaly.dailyPnl.submission.version,
        operationsVersion: operations?.version,
        laborVersion: labor?.version
      });

      const opsInput = operations ? {
        fcId,
        businessDate: dateStr,
        inboundShipments: operations.inboundShipments,
        outboundOrders: operations.outboundOrders,
        unitsProcessed: operations.unitsProcessed,
        orderLinesProcessed: operations.orderLinesProcessed,
        returnsProcessed: operations.returnsProcessed,
        operatingHours: Number(operations.operatingHours),
        storageOccupancyPct: operations.storageOccupancyPct ? Number(operations.storageOccupancyPct) : null
      } : null;

      const laborInput = labor ? {
        fcId,
        businessDate: dateStr,
        plannedHeadcount: labor.plannedHeadcount,
        actualHeadcount: labor.actualHeadcount,
        plannedLabourHours: Number(labor.plannedLabourHours),
        actualPaidHours: Number(labor.actualPaidHours),
        productiveHours: Number(labor.productiveHours),
        overtimeHours: Number(labor.overtimeHours),
        contractorHeadcount: labor.contractorHeadcount,
        contractorHours: Number(labor.contractorHours),
        contractorCost: labor.contractorCost.toString()
      } : null;

      const derivedOps = calculateOperationalMetrics(opsInput);
      const derivedLabor = calculateWorkforceMetrics(laborInput, opsInput);
      const derivedProd = calculateProductivityMetrics(
        anomaly.dailyPnl.manpowerCost.toString(),
        opsInput,
        laborInput
      );
      const reconciliation = reconcileContractorCosts(
        anomaly.dailyPnl.manpowerCost.toString(),
        labor?.contractorCost ? labor.contractorCost.toString() : null
      );

      const historicalComparisons = {
        outboundOrders: compareMetricToHistorical(
          'outboundOrders',
          operations?.outboundOrders,
          priorOps.map(o => ({ businessDate: o.businessDate.toISOString().split('T')[0]!, value: o.outboundOrders })),
          'orders',
          { targetBusinessDate: dateStr, windowDays: 30 }
        ),
        overtimeRatio: compareMetricToHistorical(
          'overtimeRatio',
          derivedLabor.overtimeRatio,
          priorLabor.map(l => {
            const paid = Number(l.actualPaidHours);
            const ot = Number(l.overtimeHours);
            return {
              businessDate: l.businessDate.toISOString().split('T')[0]!,
              value: paid > 0 ? (ot / paid) * 100 : null
            };
          }),
          '%',
          { targetBusinessDate: dateStr, windowDays: 30 }
        ),
        labourUtilization: compareMetricToHistorical(
          'labourUtilization',
          derivedLabor.labourUtilization,
          priorLabor.map(l => {
            const paid = Number(l.actualPaidHours);
            const prod = Number(l.productiveHours);
            return {
              businessDate: l.businessDate.toISOString().split('T')[0]!,
              value: paid > 0 ? (prod / paid) * 100 : null
            };
          }),
          '%',
          { targetBusinessDate: dateStr, windowDays: 30 }
        )
      };

      const aiReportVersions = await prisma.aIReport.findMany({
        where: { dailyPnlId: anomaly.dailyPnlId },
        orderBy: { version: 'desc' }
      });

      // Prepare AI input payload and readiness check
      let preparedAiData: any = null;
      try {
        preparedAiData = await getPreparedAIInputForAnomaly(prisma, anomalyId);
      } catch (err: any) {
        console.warn(`Failed to prepare AI input payload for anomaly ${anomalyId}:`, err.message);
      }

      res.json({
        ...anomaly,
        aiReportVersions,
        aiReadiness: preparedAiData?.aiReadiness ?? {
          canTrigger: completeness.completeness === 'COMPLETE',
          hasAllThreeFiles: completeness.completeness === 'COMPLETE',
          completeness: completeness.completeness,
          diagnosticStatus: completeness.diagnosticStatus,
          files: {
            pnl: { uploaded: completeness.hasPnl, version: anomaly.dailyPnl.submission.version, name: 'Financial P&L' },
            operations: { uploaded: completeness.hasOperations, version: operations?.version ?? null, name: 'Daily Operations' },
            labor: { uploaded: completeness.hasLabor, version: labor?.version ?? null, name: 'Daily Labor' }
          },
          missingFiles: [
            !completeness.hasPnl ? 'Financial P&L' : null,
            !completeness.hasOperations ? 'Daily Operations' : null,
            !completeness.hasLabor ? 'Daily Labor' : null
          ].filter(Boolean)
        },
        aiInputPayload: preparedAiData?.inputPayload ?? null,
        aiPromptPreview: preparedAiData?.promptPreview ?? null,
        operationalContext: {
          operations,
          labor,
          derived: {
            operations: derivedOps,
            workforce: derivedLabor,
            productivity: derivedProd
          },
          derivedMetrics: {
            operational: derivedOps,
            workforce: derivedLabor,
            productivity: derivedProd,
            reconciliation
          },
          historicalComparisons,
          completeness,
          contractorReconciliation: reconciliation
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

anomaliesRouter.get(
  '/:anomalyId/ai-input',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const anomalyId = String(req.params.anomalyId);
      const anomaly = await prisma.anomaly.findUnique({
        where: { id: anomalyId },
        include: { dailyPnl: { include: { submission: true } } }
      });

      if (!anomaly) {
        res.status(404).json({ error: `Anomaly '${anomalyId}' not found` });
        return;
      }

      if (
        req.user!.role === UserRole.FC_MANAGER &&
        !req.user!.assignedFcIds.includes(anomaly.dailyPnl.submission.fcId)
      ) {
        res.status(403).json({ error: 'Forbidden: you do not have access to this FC' });
        return;
      }

      const preparedData = await getPreparedAIInputForAnomaly(prisma, anomalyId);
      res.json(preparedData);
    } catch (err) {
      next(err);
    }
  }
);

anomaliesRouter.post(
  '/:anomalyId/trigger-ai',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const anomalyId = String(req.params.anomalyId);
      const result = await triggerAIInvestigationForAnomaly(
        prisma,
        anomalyId,
        req.user!.id,
        req.user!.role,
        req.user!.assignedFcIds
      );
      res.json(result);
    } catch (err: any) {
      if (err.status) {
        res.status(err.status).json({
          error: err.message,
          missingFiles: err.missingFiles
        });
      } else if (err.message && (err.message.includes('all three files') || err.message.includes('must be uploaded'))) {
        res.status(400).json({
          error: err.message,
          missingFiles: err.missingFiles
        });
      } else if (err.message && err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else if (err.message && err.message.includes('not found')) {
        res.status(404).json({ error: err.message });
      } else {
        next(err);
      }
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
