import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { loginRequestSchema } from '@prozo/shared';
import { generateTokens, authenticate } from '../../middleware/auth.js';
import { config } from '../../config/index.js';

const prisma = new PrismaClient();
export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginRequestSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        assignedFCs: {
          select: { fcId: true }
        }
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user);

    // Set secure HttpOnly cookies
    res.cookie('prozo_access_token', accessToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('prozo_refresh_token', refreshToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedFcIds: user.assignedFCs.map(a => a.fcId)
      },
      accessToken
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('prozo_access_token');
  res.clearCookie('prozo_refresh_token');
  res.json({ message: 'Successfully logged out' });
});

authRouter.get('/me', authenticate, (req: Request, res: Response): void => {
  res.json({ user: req.user });
});
