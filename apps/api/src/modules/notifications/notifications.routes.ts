import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const notificationsRouter = Router();

/**
 * GET /api/v1/notifications
 * Get in-app notifications for the authenticated user
 */
notificationsRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 30;

      const whereClause: any = { userId };
      if (unreadOnly) {
        whereClause.isRead = false;
      }

      const notifications = await prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      res.json(notifications);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/notifications/unread-count
 * Quick count of unread notifications for the bell badge
 */
notificationsRouter.get(
  '/unread-count',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const count = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      res.json({ count });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read
 */
notificationsRouter.patch(
  '/:id/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const notificationId = String(req.params.id);

      const notification = await prisma.notification.findFirst({
        where: { id: notificationId, userId }
      });

      if (!notification) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/notifications/mark-all-read
 * Mark all notifications for the user as read
 */
notificationsRouter.post(
  '/mark-all-read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      res.json({ message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  }
);
