import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubscription } from '../contexts/SubscriptionContext';

/**
 * Hook to check and handle Pro feature access
 * Returns a function that checks if user has Pro access before executing an action
 */
export function useProFeature() {
  const { isProUser } = useSubscription();
  const router = useRouter();

  /**
   * Check if user has Pro access and execute callback or show upgrade prompt
   *
   * @param callback - Function to execute if user has Pro access
   * @param featureName - Optional name of the feature for the alert message
   * @returns Promise that resolves to true if callback was executed, false otherwise
   */
  const requirePro = useCallback(
    async (callback: () => void | Promise<void>, featureName?: string): Promise<boolean> => {
      if (isProUser) {
        await callback();
        return true;
      }

      Alert.alert(
        'Pro Feature',
        `${featureName || 'This feature'} is only available with Pantry Chef Pro.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Upgrade to Pro',
            onPress: () => router.push('/paywall'),
          },
        ]
      );

      return false;
    },
    [isProUser, router]
  );

  /**
   * Check if user has Pro access
   */
  const checkProAccess = useCallback((): boolean => {
    return isProUser;
  }, [isProUser]);

  /**
   * Show upgrade prompt
   */
  const showUpgradePrompt = useCallback(
    (featureName?: string) => {
      Alert.alert(
        'Upgrade to Pro',
        `${featureName || 'This feature'} is only available with Pantry Chef Pro. Upgrade now to unlock unlimited features!`,
        [
          {
            text: 'Maybe Later',
            style: 'cancel',
          },
          {
            text: 'Upgrade Now',
            onPress: () => router.push('/paywall'),
          },
        ]
      );
    },
    [router]
  );

  return {
    isProUser,
    requirePro,
    checkProAccess,
    showUpgradePrompt,
  };
}
