import { Request, Response, NextFunction } from 'express';
import { hasEnoughCredits } from '../services/credit';
import { prisma } from '../index.js';

/**
 * Middleware to check if user has enough credits for an action
 * Requires auth middleware to run first
 *
 * Usage:
 * router.post('/endpoint', authMiddleware, requireCredits(2), handler);
 */
export function requireCredits(amount: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const hasCredits = await hasEnoughCredits(userId, amount);

      if (!hasCredits) {
        return res.status(402).json({
          success: false,
          message: 'Insufficient credits',
          error: 'INSUFFICIENT_CREDITS',
          required: amount,
        });
      }

      next();
    } catch (error: any) {
      console.error('Credit check middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check credits',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  };
}

/**
 * Middleware to check if user has the required subscription tier
 * Returns 403 if user doesn't have the required tier
 *
 * Usage:
 * router.get('/endpoint', authMiddleware, requireTier('pro'), handler);  // Pro OR Power
 * router.get('/endpoint', authMiddleware, requireTier('power'), handler); // Power only
 */
export function requireTier(tier: 'pro' | 'power') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isProUser: true, isPowerUser: true, subscriptionTier: true },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      // 'pro' tier requirement: satisfied by Pro OR Power users
      // 'power' tier requirement: satisfied only by Power users
      const hasAccess = tier === 'pro' ? user.isProUser : user.isPowerUser;

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `This feature requires a ${tier === 'pro' ? 'Pro' : 'Power'} subscription`,
          error: 'FEATURE_GATED',
          requiredTier: tier,
          currentTier: user.subscriptionTier || 'free',
        });
      }

      next();
    } catch (error: any) {
      console.error('Tier check middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check subscription tier',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  };
}

/**
 * Middleware to attach user's credit balance to request
 * Useful for endpoints that need to show balance
 */
export async function attachCreditBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return next();
    }

    const { getBalance } = await import('../services/credit.js');
    const balance = await getBalance(userId);

    // @ts-ignore
    req.creditBalance = balance;

    next();
  } catch (error) {
    // Don't fail request if balance fetch fails
    console.error('Failed to attach credit balance:', error);
    next();
  }
}
