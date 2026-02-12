import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { REVENUECAT_API_KEY } from '../config';

// RevenueCat Entitlement IDs
export const ENTITLEMENT_PRO = 'pantry-chef Pro';
export const ENTITLEMENT_POWER = 'pantry-chef Power';
// Keep ENTITLEMENT_ID for backwards compatibility
export const ENTITLEMENT_ID = ENTITLEMENT_PRO;

// Subscription Product IDs - must match your RevenueCat dashboard configuration
export const PRODUCT_IDS = {
  PRO_MONTHLY: 'Pro_Tier_Monthly_499',
  PRO_ANNUAL: 'Pro_Tier_Annual_499',
} as const;

// Offering identifier for the paywall
export const OFFERING_ID = 'Pro_Tier_499';

// Consumable Product IDs
export const CONSUMABLE_IDS = {
  CREDITS_10: 'credits_10',   // $1.99
  CREDITS_30: 'credits_30',   // $4.99
  CREDITS_75: 'credits_75',   // $9.99
} as const;

/**
 * Initialize RevenueCat SDK
 * Call this once when the app starts, before any other RevenueCat operations
 *
 * @param userId - Optional user ID to identify the customer
 */
export const initializeRevenueCat = async (userId?: string): Promise<void> => {
  try {
    if (__DEV__) {
      // Enable debug logs in development
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    } else {
      // Use info level in production
      Purchases.setLogLevel(LOG_LEVEL.INFO);
    }

    // Configure the SDK with your API key
    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
    });

    // If we have a user ID, identify the user
    if (userId) {
      await Purchases.logIn(userId);
      console.log('RevenueCat: User logged in with ID:', userId);
    }

    console.log('RevenueCat: SDK initialized successfully');
  } catch (error) {
    console.error('RevenueCat: Failed to initialize SDK:', error);
    throw error;
  }
};

/**
 * Login a user to RevenueCat
 * Call this when your user authenticates
 * Note: This automatically triggers the customer info update listener
 *
 * @param userId - Unique user identifier from your auth system
 */
export const loginRevenueCatUser = async (userId: string): Promise<void> => {
  try {
    // logIn() returns customerInfo but also triggers the update listener
    // Callers should rely on the listener, not call getCustomerInfo() again
    const { customerInfo } = await Purchases.logIn(userId);
    console.log('RevenueCat: User logged in:', userId);
    console.log('RevenueCat: Active entitlements:', Object.keys(customerInfo.entitlements.active));
    return;
  } catch (error) {
    console.error('RevenueCat: Failed to login user:', error);
    throw error;
  }
};

/**
 * Logout the current user from RevenueCat
 * Call this when your user logs out
 * Note: This automatically triggers the customer info update listener
 */
export const logoutRevenueCatUser = async (): Promise<void> => {
  try {
    // Check if user is already anonymous before attempting logout
    const customerInfo = await Purchases.getCustomerInfo();
    const isAnonymous = customerInfo.originalAppUserId.startsWith('$RCAnonymousID:');

    if (isAnonymous) {
      console.log('RevenueCat: User is already anonymous, skipping logout');
      return;
    }

    // logOut() returns customerInfo but also triggers the update listener
    // Callers should rely on the listener, not call getCustomerInfo() again
    const { customerInfo: loggedOutInfo } = await Purchases.logOut();
    console.log('RevenueCat: User logged out, now anonymous');
    return;
  } catch (error) {
    console.error('RevenueCat: Failed to logout user:', error);
    throw error;
  }
};

/**
 * Check if user has access to Pro features (Pro OR Power tier)
 *
 * @returns true if user has active Pro entitlement
 */
export const checkProAccess = async (): Promise<boolean> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const hasProAccess = typeof customerInfo.entitlements.active[ENTITLEMENT_PRO] !== 'undefined';

    console.log('RevenueCat: Pro access check:', hasProAccess);
    return hasProAccess;
  } catch (error) {
    console.error('RevenueCat: Failed to check Pro access:', error);
    return false;
  }
};

/**
 * Check if user has access to Power features (Power tier only)
 *
 * @returns true if user has active Power entitlement
 */
export const checkPowerAccess = async (): Promise<boolean> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const hasPowerAccess = typeof customerInfo.entitlements.active[ENTITLEMENT_POWER] !== 'undefined';

    console.log('RevenueCat: Power access check:', hasPowerAccess);
    return hasPowerAccess;
  } catch (error) {
    console.error('RevenueCat: Failed to check Power access:', error);
    return false;
  }
};

/**
 * Get current customer info including all entitlements and purchases
 *
 * @returns CustomerInfo object with all subscription details
 */
export const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('RevenueCat: Failed to get customer info:', error);
    throw error;
  }
};

/**
 * Get available offerings (subscription packages)
 * First tries to get the specific offering by ID, falls back to current offering
 *
 * @returns Offering with available packages
 */
export const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();

    // Try to get our specific offering first
    const targetOffering = offerings.all[OFFERING_ID];
    if (targetOffering) {
      console.log('RevenueCat: Found offering:', OFFERING_ID, 'with', targetOffering.availablePackages.length, 'packages');
      return targetOffering;
    }

    // Fallback to current offering
    if (!offerings.current) {
      console.warn('RevenueCat: No current offering found');
      return null;
    }

    console.log('RevenueCat: Using current offering with', offerings.current.availablePackages.length, 'packages');
    return offerings.current;
  } catch (error) {
    console.error('RevenueCat: Failed to get offerings:', error);
    throw error;
  }
};

/**
 * Purchase a package
 *
 * @param packageToPurchase - The package to purchase
 * @returns CustomerInfo after successful purchase
 */
export const purchasePackage = async (packageToPurchase: any) => {
  try {
    const { customerInfo, productIdentifier } = await Purchases.purchasePackage(packageToPurchase);

    console.log('RevenueCat: Purchase successful!', productIdentifier);
    console.log('RevenueCat: Active entitlements:', Object.keys(customerInfo.entitlements.active));

    return { customerInfo, productIdentifier };
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('RevenueCat: User cancelled purchase');
    } else {
      console.error('RevenueCat: Purchase failed:', error);
    }
    throw error;
  }
};

/**
 * Restore previous purchases
 * Useful when user reinstalls app or switches devices
 *
 * @returns Restored customer info
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();

    console.log('RevenueCat: Purchases restored');
    console.log('RevenueCat: Active entitlements:', Object.keys(customerInfo.entitlements.active));

    return customerInfo;
  } catch (error) {
    console.error('RevenueCat: Failed to restore purchases:', error);
    throw error;
  }
};

/**
 * Check if a specific product is active
 *
 * @param productId - Product identifier to check
 * @returns true if product is active
 */
export const isProductActive = async (productId: string): Promise<boolean> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();

    // Check if any active entitlement includes this product
    const activeEntitlements = Object.values(customerInfo.entitlements.active);
    const isActive = activeEntitlements.some(
      (entitlement: any) => entitlement.productIdentifier === productId
    );

    return isActive;
  } catch (error) {
    console.error('RevenueCat: Failed to check product status:', error);
    return false;
  }
};

/**
 * Get subscription status details
 *
 * @returns Object with subscription details
 */
export const getSubscriptionStatus = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const proEntitlement = customerInfo.entitlements.active[ENTITLEMENT_PRO];
    const powerEntitlement = customerInfo.entitlements.active[ENTITLEMENT_POWER];

    // Determine tier: Power > Pro > free
    const isPower = typeof powerEntitlement !== 'undefined';
    const isPro = typeof proEntitlement !== 'undefined';
    const tier: 'power' | 'pro' | null = isPower ? 'power' : isPro ? 'pro' : null;
    const activeEntitlement = isPower ? powerEntitlement : proEntitlement;

    if (!activeEntitlement) {
      return {
        isActive: false,
        tier: null,
        productId: null,
        willRenew: false,
        expirationDate: null,
      };
    }

    return {
      isActive: true,
      tier,
      productId: activeEntitlement.productIdentifier,
      willRenew: activeEntitlement.willRenew,
      expirationDate: activeEntitlement.expirationDate,
      periodType: activeEntitlement.periodType,
      store: activeEntitlement.store,
    };
  } catch (error) {
    console.error('RevenueCat: Failed to get subscription status:', error);
    return {
      isActive: false,
      tier: null,
      productId: null,
      willRenew: false,
      expirationDate: null,
    };
  }
};
