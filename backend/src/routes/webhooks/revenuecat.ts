import { Router, Request, Response } from 'express';
import {
  grantSubscriptionCredits,
  grantPurchasedCredits,
  updateSubscriptionTier,
} from '../../services/credit';

const router = Router();

/**
 * POST /api/webhooks/revenuecat
 * Handle RevenueCat webhook events
 *
 * Event types:
 * - INITIAL_PURCHASE: User purchased subscription → Grant credits, set tier (Pro/Power)
 * - RENEWAL: Subscription renewed → Grant credits
 * - CANCELLATION: User cancelled → Keep tier until expiration (user keeps credits)
 * - EXPIRATION: Subscription expired → Remove tier + feature access (user keeps credits)
 * - NON_RENEWING_PURCHASE: One-time purchase → Grant consumable credits
 *
 * Documentation: https://www.revenuecat.com/docs/webhooks
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const event = req.body;

    console.log('RevenueCat webhook received:', event.type);

    // Verify webhook authenticity (optional but recommended)
    // const authHeader = req.headers.authorization;
    // if (authHeader !== `Bearer ${process.env.REVENUECAT_WEBHOOK_SECRET}`) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }

    const eventType = event.type;
    const appUserId = event.event?.app_user_id;
    const productId = event.event?.product_id;
    const entitlementIds = event.event?.entitlement_ids || [];

    if (!appUserId) {
      console.error('No app_user_id in webhook event');
      return res.status(400).json({ error: 'Missing app_user_id' });
    }

    // Handle different event types
    switch (eventType) {
      case 'INITIAL_PURCHASE':
        await handleInitialPurchase(appUserId, productId, entitlementIds);
        break;

      case 'RENEWAL':
        await handleRenewal(appUserId, productId, entitlementIds);
        break;

      case 'CANCELLATION':
        await handleCancellation(appUserId);
        break;

      case 'EXPIRATION':
        await handleExpiration(appUserId);
        break;

      case 'NON_RENEWING_PURCHASE':
        await handleOneTimePurchase(appUserId, productId);
        break;

      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('RevenueCat webhook error:', error);
    // Still return 200 to prevent webhook retries
    return res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Handle initial subscription purchase
 * - Grant monthly credits based on tier
 * - Set subscription tier (Pro or Power)
 */
async function handleInitialPurchase(
  userId: string,
  productId: string,
  entitlementIds: string[]
): Promise<void> {
  console.log(`Handling INITIAL_PURCHASE for user ${userId}, product ${productId}`);

  const tier = getTierFromEntitlements(entitlementIds, productId);

  if (tier) {
    // Grant subscription credits
    await grantSubscriptionCredits(userId, tier);

    // Set subscription tier (handles isProUser/isPowerUser flags)
    await updateSubscriptionTier(userId, tier);

    console.log(`Granted ${tier} subscription credits to user ${userId}`);
  }
}

/**
 * Handle subscription renewal
 * - Grant monthly credits
 * - Ensure tier status is still active
 */
async function handleRenewal(
  userId: string,
  productId: string,
  entitlementIds: string[]
): Promise<void> {
  console.log(`Handling RENEWAL for user ${userId}, product ${productId}`);

  const tier = getTierFromEntitlements(entitlementIds, productId);

  if (tier) {
    await grantSubscriptionCredits(userId, tier);
    await updateSubscriptionTier(userId, tier);

    console.log(`Renewed ${tier} subscription for user ${userId}`);
  }
}

/**
 * Handle subscription cancellation
 * - Keep tier active until expiration
 * - User keeps their existing credits
 */
async function handleCancellation(userId: string): Promise<void> {
  console.log(`Handling CANCELLATION for user ${userId}`);

  // Don't remove tier immediately - wait for expiration
  // User keeps credits and tier access until billing period ends
  console.log(`User ${userId} cancelled subscription (will expire at end of period)`);
}

/**
 * Handle subscription expiration
 * - Remove subscription tier + feature access
 * - User keeps existing credits but won't get monthly grants
 */
async function handleExpiration(userId: string): Promise<void> {
  console.log(`Handling EXPIRATION for user ${userId}`);

  // Remove subscription tier (sets isProUser=false, isPowerUser=false)
  await updateSubscriptionTier(userId, null);

  console.log(`User ${userId} subscription expired, tier removed`);
}

/**
 * Handle one-time credit purchase (consumable)
 * - Grant purchased credits
 */
async function handleOneTimePurchase(userId: string, productId: string): Promise<void> {
  console.log(`Handling NON_RENEWING_PURCHASE for user ${userId}, product ${productId}`);

  // Map product ID to credit amount
  const creditAmount = getCreditAmountFromProductId(productId);

  if (creditAmount) {
    await grantPurchasedCredits(userId, productId, creditAmount);
    console.log(`Granted ${creditAmount} credits to user ${userId}`);
  } else {
    console.warn(`Unknown product ID for credit purchase: ${productId}`);
  }
}

/**
 * Determine subscription tier from entitlements and product ID
 * Power users have BOTH 'pantry-chef Pro' and 'pantry-chef Power' entitlements
 */
function getTierFromEntitlements(entitlementIds: string[], productId: string): 'pro' | 'power' | null {
  const hasPowerEntitlement = entitlementIds.includes('pantry-chef Power');
  const hasProEntitlement = entitlementIds.includes('pantry-chef Pro');

  // Power tier check first (Power users have both entitlements)
  if (hasPowerEntitlement) {
    return 'power';
  }

  if (hasProEntitlement) {
    return 'pro';
  }

  // Fallback: determine tier from product ID
  return getTierFromProductId(productId);
}

/**
 * Map RevenueCat product ID to subscription tier
 * Product IDs: pro_monthly, power_monthly
 */
function getTierFromProductId(productId: string): 'pro' | 'power' | null {
  if (productId === 'power_monthly' || productId.includes('power')) {
    return 'power';
  } else if (productId === 'pro_monthly' || productId.includes('pro')) {
    return 'pro';
  }

  console.warn(`Could not determine tier from product ID: ${productId}`);
  return null;
}

/**
 * Map RevenueCat product ID to credit amount for one-time purchases
 * Product IDs: credits_10 ($1.99), credits_30 ($4.99), credits_75 ($9.99)
 */
function getCreditAmountFromProductId(productId: string): number | null {
  const creditMap: Record<string, number> = {
    'credits_10': 10,   // $1.99
    'credits_30': 30,   // $4.99
    'credits_75': 75,   // $9.99
  };

  // Also support parsing credits from product ID (e.g., 'credits_30' → 30)
  if (creditMap[productId]) {
    return creditMap[productId];
  }

  // Try to extract amount from product ID pattern 'credits_N'
  const match = productId.match(/^credits_(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

export default router;
