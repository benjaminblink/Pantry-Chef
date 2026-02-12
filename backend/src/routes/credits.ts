import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  getBalance,
  getTransactionHistory,
  getCreatorEarningsSummary,
  grantPurchasedCredits,
  refreshProStatusIfStale,
} from '../services/credit.js';

const router = Router();

/**
 * GET /api/credits/balance
 * Get user's current credit balance
 */
router.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const balance = await getBalance(userId);

    return res.json({
      success: true,
      balance,
    });
  } catch (error: any) {
    console.error('Get balance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get credit balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/credits/transactions
 * Get user's credit transaction history
 */
router.get('/transactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { limit, offset, type } = req.query;

    const result = await getTransactionHistory(userId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      type: type as any,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Get transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get transaction history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/credits/creator/earnings
 * Get creator's earnings summary
 */
router.get('/creator/earnings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const summary = await getCreatorEarningsSummary(userId);

    return res.json({
      success: true,
      ...summary,
    });
  } catch (error: any) {
    console.error('Get creator earnings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get earnings summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/credits/purchase
 * Record a credit purchase (called after RevenueCat purchase completes)
 * This should ideally be called from a RevenueCat webhook, not directly from client
 */
router.post('/purchase', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { productId, credits } = req.body;

    if (!productId || !credits || typeof credits !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Product ID and credits amount required',
      });
    }

    // Validate credit amounts match consumable product tiers
    // credits_10 ($1.99), credits_30 ($4.99), credits_75 ($9.99)
    const VALID_CREDIT_AMOUNTS = [10, 30, 75];
    if (!VALID_CREDIT_AMOUNTS.includes(credits)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credit amount',
      });
    }

    await grantPurchasedCredits(userId, productId, credits);

    const newBalance = await getBalance(userId);

    return res.json({
      success: true,
      message: `${credits} credits added to your account`,
      credits,
      balance: newBalance,
    });
  } catch (error: any) {
    console.error('Credit purchase error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process credit purchase',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/credits/status
 * Get comprehensive credit status including balance, Pro status, and recent activity
 */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check if Pro status needs refresh
    const needsRefresh = await refreshProStatusIfStale(userId);

    const [balance, recentTransactions] = await Promise.all([
      getBalance(userId),
      getTransactionHistory(userId, { limit: 10 }),
    ]);

    // Get user's subscription status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isProUser: true,
        isPowerUser: true,
        subscriptionTier: true,
        totalWalmartCheckouts: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      balance,
      isProUser: user?.isProUser || false,
      isPowerUser: user?.isPowerUser || false,
      subscriptionTier: user?.subscriptionTier || null,
      totalWalmartCheckouts: user?.totalWalmartCheckouts || 0,
      memberSince: user?.createdAt,
      recentTransactions: recentTransactions.transactions,
      needsProStatusRefresh: needsRefresh,
    });
  } catch (error: any) {
    console.error('Get credit status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get credit status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
