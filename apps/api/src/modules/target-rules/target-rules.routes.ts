import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createTargetRuleSchema } from '@prozo/shared';
import { authenticate, requireRole } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const targetRulesRouter = Router();

targetRulesRouter.get(
  '/',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rules = await prisma.targetRule.findMany({
        include: {
          fc: { select: { code: true, name: true } },
          createdBy: { select: { name: true, email: true } }
        },
        orderBy: [{ metricKey: 'asc' }, { effectiveFrom: 'desc' }]
      });

      res.json(rules);
    } catch (err) {
      next(err);
    }
  }
);

targetRulesRouter.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createTargetRuleSchema.parse(req.body);

      const rule = await prisma.targetRule.create({
        data: {
          fcId: parsed.fcId || null,
          metricKey: parsed.metricKey,
          minPct: parsed.minPct,
          maxPct: parsed.maxPct,
          effectiveFrom: new Date(parsed.effectiveFrom),
          effectiveTo: parsed.effectiveTo ? new Date(parsed.effectiveTo) : null,
          createdById: req.user!.id
        }
      });

      res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  }
);
