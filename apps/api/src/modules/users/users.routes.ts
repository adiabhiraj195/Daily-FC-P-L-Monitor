import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';
import { createManagerRequestSchema } from '@prozo/shared';
import { authenticate, requireRole } from '../../middleware/auth.js';

const prisma = new PrismaClient();
export const usersRouter = Router();

/**
 * GET /api/v1/users
 * Admin and Finance can view all users and their assigned FCs
 */
usersRouter.get(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.FINANCE]),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          assignedFCs: {
            include: {
              fc: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  location: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(users);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/users
 * Admin flow to create new user IDs, specifically for managers of a new or existing FC
 */
usersRouter.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createManagerRequestSchema.parse(req.body);
      const emailNormalized = parsed.email.toLowerCase().trim();

      // Check if user email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: emailNormalized }
      });

      if (existingUser) {
        res.status(409).json({ error: `User with email '${emailNormalized}' already exists` });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(parsed.password, 10);

      // Transaction: create FC if new, create user, link manager to FC, record audit log
      const result = await prisma.$transaction(async tx => {
        let targetFcId = parsed.fcId;

        // 1. If new FC details are provided, create the Fulfilment Centre first
        if (parsed.newFC) {
          const fcCode = parsed.newFC.code.toUpperCase().trim();
          const existingFC = await tx.fulfilmentCentre.findUnique({
            where: { code: fcCode }
          });

          if (existingFC) {
            throw new Error(`Fulfilment Centre with code '${fcCode}' already exists`);
          }

          const createdFC = await tx.fulfilmentCentre.create({
            data: {
              code: fcCode,
              name: parsed.newFC.name.trim(),
              location: parsed.newFC.location?.trim() || null,
              currency: parsed.newFC.currency || 'INR',
              isActive: true
            }
          });

          targetFcId = createdFC.id;
        }

        // 2. If fcId was specified, verify it exists
        if (targetFcId) {
          const fcExists = await tx.fulfilmentCentre.findUnique({
            where: { id: targetFcId }
          });
          if (!fcExists) {
            throw new Error(`Target Fulfilment Centre with ID '${targetFcId}' not found`);
          }
        }

        // 3. Create the user
        const newUser = await tx.user.create({
          data: {
            name: parsed.name.trim(),
            email: emailNormalized,
            passwordHash,
            role: parsed.role as UserRole,
            isActive: true
          }
        });

        // 4. Assign FC to manager if targetFcId exists
        let assignedFC = null;
        if (targetFcId) {
          const assignment = await tx.userFulfilmentCentre.create({
            data: {
              userId: newUser.id,
              fcId: targetFcId
            },
            include: {
              fc: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  location: true
                }
              }
            }
          });
          assignedFC = assignment.fc;
        }

        // 5. Audit log
        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: 'CREATE_USER',
            entityType: 'User',
            entityId: newUser.id,
            metadata: {
              createdEmail: newUser.email,
              role: newUser.role,
              assignedFcId: targetFcId,
              isNewFC: !!parsed.newFC
            }
          }
        });

        return {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt,
          assignedFC
        };
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('not found'))) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  }
);
