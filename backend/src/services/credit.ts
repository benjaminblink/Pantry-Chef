import { CreditTransactionType, Prisma } from '@prisma/client';
import { prisma } from '../index.js';

// Type alias for Prisma transaction client
type TxClient = Prisma.TransactionClient;

// ============================================
// CREDIT GRANT OPERATIONS
// ============================================

/**
 * Grant signup bonus credits (25 credits)
 * Called once when user creates account
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  const SIGNUP_BONUS = 25;

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: SIGNUP_BONUS },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: SIGNUP_BONUS,
        type: CreditTransactionType.SIGNUP_BONUS,
        description: 'Welcome bonus',
        metadata: {},
      },
    });
  });
}

/**
 * Grant credits for Walmart checkout with declining rewards
 * Schedule: 15 → 10 → 5 (steady state)
 * Returns the number of credits granted
 */
export async function grantWalmartCheckoutCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totalWalmartCheckouts: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const checkoutNumber = user.totalWalmartCheckouts + 1;
  let creditsToGrant: number;

  if (checkoutNumber === 1) {
    creditsToGrant = 15;
  } else if (checkoutNumber === 2) {
    creditsToGrant = 10;
  } else {
    creditsToGrant = 5;
  }

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: creditsToGrant },
        totalWalmartCheckouts: { increment: 1 },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: creditsToGrant,
        type: CreditTransactionType.WALMART_CHECKOUT,
        description: `Walmart checkout #${checkoutNumber}`,
        metadata: { checkoutNumber, creditsGranted: creditsToGrant },
      },
    });
  });

  return creditsToGrant;
}

/**
 * Grant monthly subscription credits
 * Called when subscription is purchased or renewed via RevenueCat webhook
 */
export async function grantSubscriptionCredits(
  userId: string,
  tier: 'pro' | 'power'
): Promise<void> {
  const TIER_CREDITS = { pro: 40, power: 100 };
  const credits = TIER_CREDITS[tier];

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: credits } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: credits,
        type: CreditTransactionType.SUBSCRIPTION_GRANT,
        description: `Monthly ${tier} subscription credits`,
        metadata: { tier, period: 'monthly' },
      },
    });
  });
}

/**
 * Grant credits from one-time purchase via RevenueCat
 */
export async function grantPurchasedCredits(
  userId: string,
  productId: string,
  credits: number
): Promise<void> {
  await prisma.$transaction(async (tx: TxClient) => {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: credits } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: credits,
        type: CreditTransactionType.CREDIT_PURCHASE,
        description: `Purchased ${credits} credits`,
        metadata: { productId, credits },
      },
    });
  });
}

// ============================================
// CREDIT SPENDING OPERATIONS
// ============================================

export async function hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });

  if (!user) {
    return false;
  }

  return user.credits >= amount;
}

export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user.credits;
}

/**
 * Charge credits for an action
 * Throws error if insufficient credits
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const hasCredits = await hasEnoughCredits(userId, amount);
  if (!hasCredits) {
    throw new Error('Insufficient credits');
  }

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { decrement: amount } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        type,
        description,
        metadata: (metadata || {}) as Prisma.InputJsonValue,
      },
    });
  });
}

// ============================================
// RECIPE USAGE & CREATOR PAYOUTS
// ============================================

/**
 * Record a community recipe usage
 * NOTE: Credit charges are DISABLED for competition.
 * Recipe use is free to maximize engagement and Walmart checkouts.
 * Tracks usage for analytics only. Creator economy will be re-enabled post-competition.
 */
export async function recordRecipeUsage(
  userId: string,
  recipeId: string
): Promise<void> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: {
      id: true,
      title: true,
      isAiGenerated: true,
      createdById: true,
    },
  });

  if (!recipe) {
    throw new Error('Recipe not found');
  }

  // Track usage for analytics (no credits charged)
  await prisma.recipeUsage.create({
    data: {
      userId,
      recipeId: recipe.id,
      creditCost: 0,
      creatorEarningAmount: new Prisma.Decimal(0),
      isPaid: false,
      requiresWalmart: false,
    },
  });
}

/**
 * Mark recipe usages as "eligible for payout" when user completes Walmart checkout
 */
export async function markUsagesEligibleForPayout(userId: string): Promise<number> {
  const now = new Date();

  const unpaidUsages = await prisma.recipeUsage.findMany({
    where: {
      userId,
      isPaid: false,
      requiresWalmart: true,
      walmartCheckoutAt: null,
    },
    select: { id: true },
  });

  if (unpaidUsages.length === 0) {
    return 0;
  }

  await prisma.recipeUsage.updateMany({
    where: {
      id: { in: unpaidUsages.map((u: { id: string }) => u.id) },
    },
    data: { walmartCheckoutAt: now },
  });

  return unpaidUsages.length;
}

/**
 * Process creator payouts (monthly batch job)
 * Pays out all eligible earnings with minimum $10 threshold
 */
export async function processCreatorPayouts(): Promise<{
  creatorsPaid: number;
  totalAmount: number;
  batchId: string;
}> {
  const MINIMUM_PAYOUT = 10.0;
  const batchId = `batch-${Date.now()}`;
  const now = new Date();

  const creatorsWithEarnings = await prisma.creatorEarning.groupBy({
    by: ['creatorId'],
    where: {
      isPaid: false,
      recipeUsage: {
        walmartCheckoutAt: { not: null },
      },
    },
    _sum: { amount: true },
    having: {
      amount: {
        _sum: { gte: MINIMUM_PAYOUT },
      },
    },
  });

  let creatorsPaid = 0;
  let totalAmount = 0;

  for (const creator of creatorsWithEarnings) {
    const creatorId = creator.creatorId;
    const amount = creator._sum.amount?.toNumber() || 0;

    if (amount < MINIMUM_PAYOUT) {
      continue;
    }

    const earnings = await prisma.creatorEarning.findMany({
      where: {
        creatorId,
        isPaid: false,
        recipeUsage: {
          walmartCheckoutAt: { not: null },
        },
      },
      select: { id: true },
    });

    const earningIds = earnings.map((e: { id: string }) => e.id);

    await prisma.$transaction(async (tx: TxClient) => {
      await tx.creatorEarning.updateMany({
        where: { id: { in: earningIds } },
        data: { isPaid: true, paidAt: now, batchId },
      });

      await tx.recipeUsage.updateMany({
        where: { id: { in: earningIds } },
        data: { isPaid: true, paidAt: now },
      });
    });

    creatorsPaid++;
    totalAmount += amount;

    console.log(`Paid creator ${creatorId}: $${amount.toFixed(2)} (${earnings.length} usages)`);
  }

  return { creatorsPaid, totalAmount, batchId };
}

// ============================================
// SUBSCRIPTION TIER & STATUS MANAGEMENT
// ============================================

/**
 * Update subscription tier and Pro/Power status flags
 * - 'pro' → isProUser=true, isPowerUser=false
 * - 'power' → isProUser=true, isPowerUser=true (Power users get both)
 * - null → isProUser=false, isPowerUser=false
 */
export async function updateSubscriptionTier(
  userId: string,
  tier: 'pro' | 'power' | null,
  revenueCatCustomerId?: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      isProUser: tier === 'pro' || tier === 'power',
      isPowerUser: tier === 'power',
      proStatusLastChecked: new Date(),
      ...(revenueCatCustomerId && { revenueCatCustomerId }),
    },
  });
}

/**
 * @deprecated Use updateSubscriptionTier instead
 */
export async function updateProStatus(
  userId: string,
  isProUser: boolean,
  revenueCatCustomerId?: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isProUser,
      isPowerUser: false,
      subscriptionTier: isProUser ? 'pro' : null,
      proStatusLastChecked: new Date(),
      ...(revenueCatCustomerId && { revenueCatCustomerId }),
    },
  });
}

export async function refreshProStatusIfStale(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proStatusLastChecked: true },
  });

  if (!user) {
    return false;
  }

  const now = new Date();
  const lastChecked = user.proStatusLastChecked;

  if (!lastChecked) {
    return true;
  }

  const hoursSinceCheck = (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60);
  return hoursSinceCheck > 24;
}

// ============================================
// TRANSACTION HISTORY
// ============================================

export async function getTransactionHistory(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: CreditTransactionType;
  }
): Promise<{
  transactions: Array<{
    id: string;
    amount: number;
    type: CreditTransactionType;
    description: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }>;
  total: number;
}> {
  const { limit = 50, offset = 0, type } = options || {};

  const where = {
    userId,
    ...(type && { type }),
  };

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return { transactions, total };
}

/**
 * Get creator's earnings summary
 */
export async function getCreatorEarningsSummary(creatorId: string): Promise<{
  totalEarned: number;
  paidOut: number;
  pending: number;
  pendingEligible: number;
  totalUses: number;
  freeUserUses: number;
  proUserUses: number;
}> {
  const allEarnings = await prisma.creatorEarning.findMany({
    where: { creatorId },
    include: {
      recipeUsage: {
        select: {
          walmartCheckoutAt: true,
          user: { select: { isProUser: true } },
        },
      },
    },
  });

  type EarningWithUsage = typeof allEarnings[number];

  const totalEarned = allEarnings.reduce(
    (sum: number, e: EarningWithUsage) => sum + e.amount.toNumber(), 0
  );
  const paidOut = allEarnings
    .filter((e: EarningWithUsage) => e.isPaid)
    .reduce((sum: number, e: EarningWithUsage) => sum + e.amount.toNumber(), 0);
  const pending = totalEarned - paidOut;
  const pendingEligible = allEarnings
    .filter((e: EarningWithUsage) => !e.isPaid && e.recipeUsage.walmartCheckoutAt !== null)
    .reduce((sum: number, e: EarningWithUsage) => sum + e.amount.toNumber(), 0);

  const totalUses = allEarnings.length;
  const proUserUses = allEarnings.filter(
    (e: EarningWithUsage) => e.recipeUsage.user.isProUser
  ).length;
  const freeUserUses = totalUses - proUserUses;

  return { totalEarned, paidOut, pending, pendingEligible, totalUses, freeUserUses, proUserUses };
}

export default {
  grantSignupBonus,
  grantWalmartCheckoutCredits,
  grantSubscriptionCredits,
  grantPurchasedCredits,
  getBalance,
  hasEnoughCredits,
  chargeCredits,
  recordRecipeUsage,
  markUsagesEligibleForPayout,
  processCreatorPayouts,
  updateSubscriptionTier,
  updateProStatus,
  refreshProStatusIfStale,
  getTransactionHistory,
  getCreatorEarningsSummary,
};
