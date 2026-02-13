import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import {
  initializeRevenueCat,
  loginRevenueCatUser,
  logoutRevenueCatUser,
  checkProAccess,
  getCustomerInfo,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getSubscriptionStatus,
  ENTITLEMENT_PRO,
  ENTITLEMENT_POWER,
} from '../services/revenueCat';
import { syncSubscriptionStatus } from '../src/api/credits';
import { useAuth } from './AuthContext';

interface SubscriptionStatus {
  isActive: boolean;
  tier: 'pro' | 'power' | null;
  productId: string | null;
  willRenew: boolean;
  expirationDate: string | null;
  periodType?: string;
  store?: string;
}

interface SubscriptionContextType {
  // State
  isProUser: boolean;
  isPowerUser: boolean;
  subscriptionTier: 'pro' | 'power' | null;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  subscriptionStatus: SubscriptionStatus;
  loading: boolean;
  error: string | null;

  // Actions
  refreshSubscriptionStatus: () => Promise<void>;
  handlePurchase: (packageToPurchase: any) => Promise<boolean>;
  handleRestorePurchases: () => Promise<boolean>;
  showPaywall: () => void;
  showCustomerCenter: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  // State
  const [isProUser, setIsProUser] = useState(false);
  const [isPowerUser, setIsPowerUser] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<'pro' | 'power' | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isActive: false,
    tier: null,
    productId: null,
    willRenew: false,
    expirationDate: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs to prevent concurrent RevenueCat API calls
  const syncingRef = useRef(false);
  const loadingCustomerInfoRef = useRef(false);
  const initializingRef = useRef(false);

  // Initialize RevenueCat on mount
  useEffect(() => {
    initRevenueCat();
  }, []);

  // Setup customer info listener
  useEffect(() => {
    const customerInfoUpdateListener = (info: CustomerInfo) => {
      console.log('SubscriptionContext: Customer info updated');
      handleCustomerInfoUpdate(info);
    };

    Purchases.addCustomerInfoUpdateListener(customerInfoUpdateListener);

    return () => {
      // Note: RevenueCat doesn't have a removeListener method for customer info
      // The listener is automatically cleaned up when the component unmounts
    };
  }, [handleCustomerInfoUpdate]);

  // Sync user with RevenueCat when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      syncUserWithRevenueCat(user.id);
    } else if (!isAuthenticated) {
      logoutFromRevenueCat();
    }
  }, [isAuthenticated, user?.id]);

  // Re-sync user when app comes to foreground
  // This handles cases where RevenueCat state was lost while app was backgrounded
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isAuthenticated && user?.id) {
        console.log('SubscriptionContext: App became active, re-syncing user');
        syncUserWithRevenueCat(user.id);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.id]);

  const initRevenueCat = async () => {
    // Prevent concurrent initialization
    if (initializingRef.current) {
      console.log('SubscriptionContext: Init already in progress, skipping');
      return;
    }

    initializingRef.current = true;
    try {
      setLoading(true);
      await initializeRevenueCat();

      // Load initial data sequentially to avoid concurrent API calls
      await loadCustomerInfo();
      await loadOfferings();
    } catch (err: any) {
      console.error('SubscriptionContext: Failed to initialize RevenueCat:', err);
      setError(err.message || 'Failed to initialize subscriptions');
    } finally {
      setLoading(false);
      initializingRef.current = false;
    }
  };

  const syncUserWithRevenueCat = async (userId: string) => {
    // Prevent concurrent calls to avoid RevenueCat 429 errors
    if (syncingRef.current) {
      console.log('SubscriptionContext: Sync already in progress, skipping');
      return;
    }

    syncingRef.current = true;
    try {
      // loginRevenueCatUser returns customerInfo and triggers the update listener
      // So we DON'T call loadCustomerInfo() after it - it will be called by the listener
      await loginRevenueCatUser(userId);
      // Wait a brief moment for the listener to process
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err: any) {
      console.error('SubscriptionContext: Failed to sync user with RevenueCat:', err);
      setError(err.message || 'Failed to sync user');
    } finally {
      syncingRef.current = false;
    }
  };

  const logoutFromRevenueCat = async () => {
    // Prevent concurrent calls during logout
    if (syncingRef.current) {
      console.log('SubscriptionContext: Sync in progress, skipping logout');
      return;
    }

    syncingRef.current = true;
    try {
      // logoutRevenueCatUser calls Purchases.logOut() which triggers the update listener
      // So we DON'T manually update state - the listener will handle it
      await logoutRevenueCatUser();
      // Wait a brief moment for the listener to process
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err: any) {
      console.error('SubscriptionContext: Failed to logout from RevenueCat:', err);
      // On error, manually reset state
      setIsProUser(false);
      setIsPowerUser(false);
      setSubscriptionTier(null);
      setCustomerInfo(null);
      setSubscriptionStatus({
        isActive: false,
        tier: null,
        productId: null,
        willRenew: false,
        expirationDate: null,
      });
    } finally {
      syncingRef.current = false;
    }
  };

  const loadCustomerInfo = async () => {
    // Prevent concurrent customer info calls
    if (loadingCustomerInfoRef.current) {
      console.log('SubscriptionContext: Customer info load already in progress, skipping');
      return;
    }

    loadingCustomerInfoRef.current = true;
    try {
      const info = await getCustomerInfo();
      handleCustomerInfoUpdate(info);
    } catch (err: any) {
      console.error('SubscriptionContext: Failed to load customer info:', err);
      setError(err.message || 'Failed to load customer info');
    } finally {
      loadingCustomerInfoRef.current = false;
    }
  };

  const loadOfferings = async () => {
    try {
      const offering = await getOfferings();
      setCurrentOffering(offering);
    } catch (err: any) {
      console.error('SubscriptionContext: Failed to load offerings:', err);
      setError(err.message || 'Failed to load offerings');
    }
  };

  const handleCustomerInfoUpdate = useCallback((info: CustomerInfo) => {
    console.log('📥 handleCustomerInfoUpdate called');
    console.log('   Active entitlements:', Object.keys(info.entitlements.active));
    console.log('   All entitlements:', Object.keys(info.entitlements.all));

    setCustomerInfo(info);

    // Check entitlements - Power users have BOTH entitlements
    const hasProAccess = typeof info.entitlements.active[ENTITLEMENT_PRO] !== 'undefined';
    const hasPowerAccess = typeof info.entitlements.active[ENTITLEMENT_POWER] !== 'undefined';

    console.log('   hasProAccess:', hasProAccess, 'hasPowerAccess:', hasPowerAccess);

    setIsProUser(hasProAccess); // true for Pro OR Power
    setIsPowerUser(hasPowerAccess);

    const tier: 'power' | 'pro' | null = hasPowerAccess ? 'power' : hasProAccess ? 'pro' : null;
    setSubscriptionTier(tier);
    console.log('   Final tier:', tier);

    // Update subscription status using the highest-tier entitlement
    const activeEntitlement = hasPowerAccess
      ? info.entitlements.active[ENTITLEMENT_POWER]
      : info.entitlements.active[ENTITLEMENT_PRO];

    if (activeEntitlement) {
      setSubscriptionStatus({
        isActive: true,
        tier,
        productId: activeEntitlement.productIdentifier,
        willRenew: activeEntitlement.willRenew,
        expirationDate: activeEntitlement.expirationDate,
        periodType: activeEntitlement.periodType,
        store: activeEntitlement.store,
      });
    } else {
      setSubscriptionStatus({
        isActive: false,
        tier: null,
        productId: null,
        willRenew: false,
        expirationDate: null,
      });
    }

    // Sync subscription status with backend (grants credits) - fire and forget
    // This handles both test purchases AND provides instant feedback
    // In production, webhooks also handle this but with a delay
    console.log('🔍 Checking sync conditions:', { userId: user?.id, tier, hasTier: !!tier });
    if (user?.id && tier) {
      console.log('✅ Syncing subscription with backend...', { tier });
      const entitlementIds = Object.keys(info.entitlements.active);
      syncSubscriptionStatus(tier, entitlementIds)
        .then(() => {
          console.log('✅ Subscription synced with backend, credits granted');
        })
        .catch((error) => {
          console.error('❌ Failed to sync subscription with backend:', error);
          // Don't throw - frontend subscription state is still valid
        });
    } else {
      console.log('⏭️ Skipping sync - no user or tier');
    }
  }, [user?.id]);

  const refreshSubscriptionStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      // Load sequentially to avoid concurrent API calls
      await loadCustomerInfo();
      await loadOfferings();
    } catch (err: any) {
      console.error('SubscriptionContext: Failed to refresh subscription status:', err);
      setError(err.message || 'Failed to refresh subscription status');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageToPurchase: any): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const { customerInfo: updatedInfo } = await purchasePackage(packageToPurchase);
      handleCustomerInfoUpdate(updatedInfo);

      return true;
    } catch (err: any) {
      if (!err.userCancelled) {
        console.error('SubscriptionContext: Purchase failed:', err);
        setError(err.message || 'Purchase failed');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRestorePurchases = async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Starting restore purchases for user:', user?.id);

      // Pass user ID to ensure we're restoring for the correct user
      // This is critical - if RC logged us out, restorePurchases() on anonymous user won't work
      const restoredInfo = await restorePurchases(user?.id);

      console.log('✅ Restore complete. Active entitlements:', Object.keys(restoredInfo.entitlements.active));
      console.log('📦 All entitlements (including expired):', Object.keys(restoredInfo.entitlements.all));

      handleCustomerInfoUpdate(restoredInfo);

      // Force a fresh customer info check after restore to ensure we have latest state
      // This handles edge cases where RevenueCat needs a moment to sync
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadCustomerInfo();

      return true;
    } catch (err: any) {
      console.error('SubscriptionContext: Restore purchases failed:', err);
      setError(err.message || 'Failed to restore purchases');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Placeholder functions - these will trigger navigation to paywall/customer center screens
  const showPaywall = () => {
    console.log('SubscriptionContext: Show paywall requested');
    // Navigation will be handled in the app routes
  };

  const showCustomerCenter = () => {
    console.log('SubscriptionContext: Show customer center requested');
    // Navigation will be handled in the app routes
  };

  const value: SubscriptionContextType = {
    isProUser,
    isPowerUser,
    subscriptionTier,
    customerInfo,
    currentOffering,
    subscriptionStatus,
    loading,
    error,
    refreshSubscriptionStatus,
    handlePurchase,
    handleRestorePurchases,
    showPaywall,
    showCustomerCenter,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
