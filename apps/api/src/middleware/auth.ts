import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { config } from '../config/index.js';

const prisma = new PrismaClient();

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedFcIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

export function generateTokens(user: { id: string; role: UserRole; email: string }) {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    config.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    config.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.prozo_access_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: missing authentication token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as { userId: string; role: UserRole };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        assignedFCs: {
          select: { fcId: true }
        }
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Unauthorized: user inactive or not found' });
      return;
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      assignedFcIds: user.assignedFCs.map(a => a.fcId)
    };

    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized: token invalid or expired' });
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: role '${req.user.role}' does not have required permissions`
      });
      return;
    }

    next();
  };
}

/**
 * Enforces that FC Managers can only query FCs assigned to them.
 * Admin and Finance users can query any FC.
 */
export function requireFCAccess(fcIdParam = 'fcId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.FINANCE) {
      next();
      return;
    }

    const rawFcId = req.params[fcIdParam] || req.query.fcId;
    const requestedFcId = Array.isArray(rawFcId) ? rawFcId[0] : rawFcId;
    if (!requestedFcId || typeof requestedFcId !== 'string') {
      next();
      return;
    }

    if (!req.user.assignedFcIds.includes(requestedFcId)) {
      res.status(403).json({
        error: `Forbidden: You do not have access to Fulfilment Centre '${requestedFcId}'`
      });
      return;
    }

    next();
  };
}
