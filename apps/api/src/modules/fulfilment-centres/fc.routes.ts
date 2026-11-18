import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, requireRole, requireFCAccess } from '../../middleware/auth.js';
import { createFCRequestSchema } from '@prozo/shared';

const prisma = new PrismaClient();
export const fcRouter = Router();

fcRouter.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createFCRequestSchema.parse(req.body);
      const code = parsed.code.toUpperCase().trim();

      const existing = await prisma.fulfilmentCentre.findUnique({
        where: { code }
      });

      if (existing) {
        res.status(409).json({ error: `Fulfilment Centre with code '${code}' already exists` });
        return;
      }

      const fc = await prisma.fulfilmentCentre.create({
        data: {
          code,
          name: parsed.name.trim(),
          location: parsed.location?.trim() || null,
          currency: parsed.currency || 'INR',
          isActive: true
        }
      });

      res.status(201).json(fc);
    } catch (err) {
      next(err);
    }
  }
);


fcRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fcFilter =
        req.user!.role === UserRole.FC_MANAGER
          ? { id: { in: req.user!.assignedFcIds }, isActive: true }
          : { isActive: true };

      const fcs = await prisma.fulfilmentCentre.findMany({
        where: fcFilter,
        include: {
          managers: {
            include: { user: { select: { id: true, name: true, email: true } } }
          }
        },
        orderBy: { code: 'asc' }
      });

      res.json(fcs);
    } catch (err) {
      next(err);
    }
  }
);

fcRouter.get(
  '/:fcId',
  authenticate,
  requireFCAccess('fcId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fcId = String(req.params.fcId);
      const fc = await prisma.fulfilmentCentre.findUnique({
        where: { id: fcId },
        include: {
          managers: {
            include: { user: { select: { id: true, name: true, email: true } } }
          }
        }
      });

      if (!fc) {
        res.status(404).json({ error: `Fulfilment Centre '${fcId}' not found` });
        return;
      }

      res.json(fc);
    } catch (err) {
      next(err);
    }
  }
);

fcRouter.get(
  '/:fcId/pnl',
  authenticate,
  requireFCAccess('fcId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fcId = String(req.params.fcId);
      const fromStr = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
      const toStr = (req.query.to as string) || new Date().toISOString().split('T')[0]!;

      const pnls = await prisma.dailyPnL.findMany({
        where: {
          submission: {
            fcId,
            businessDate: {
              gte: new Date(fromStr),
              lte: new Date(toStr)
            },
            isLatest: true
          }
        },
        include: {
          submission: {
            select: {
              businessDate: true,
              version: true,
              status: true
            }
          },
          costLines: true,
          anomalies: true,
          aiReport: true
        },
        orderBy: { submission: { businessDate: 'desc' } }
      });

      res.json(pnls);
    } catch (err) {
      next(err);
    }
  }
);

fcRouter.get(
  '/:fcId/anomalies',
  authenticate,
  requireFCAccess('fcId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fcId = String(req.params.fcId);

      const anomalies = await prisma.anomaly.findMany({
        where: {
          dailyPnl: {
            submission: {
              fcId,
              isLatest: true
            }
          }
        },
        include: {
          dailyPnl: {
            include: {
              submission: {
                select: {
                  businessDate: true,
                  fc: { select: { code: true, name: true } }
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
        orderBy: { createdAt: 'desc' }
      });

      res.json(anomalies);
    } catch (err) {
      next(err);
    }
  }
);
