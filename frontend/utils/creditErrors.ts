import { Alert } from 'react-native';
import { router } from 'expo-router';

/**
 * Handle a 402 Insufficient Credits API response.
 * Shows an alert with options to buy credits or dismiss.
 */
export function handleInsufficientCredits(required?: number, currentBalance?: number) {
  const balanceInfo = currentBalance !== undefined
    ? `You have ${currentBalance} credit${currentBalance !== 1 ? 's' : ''}. `
    : '';
  const requiredInfo = required
    ? `This action requires ${required} credit${required !== 1 ? 's' : ''}. `
    : '';

  Alert.alert(
    'Not Enough Credits',
    `${requiredInfo}${balanceInfo}Earn more by shopping with Walmart or upgrade to Pro.`,
    [
      { text: 'Buy Credits', onPress: () => router.push('/paywall') },
      { text: 'OK', style: 'cancel' },
    ]
  );
}

/**
 * Handle a 403 Feature Gated API response.
 * Shows an alert prompting upgrade to the required tier.
 */
export function handleFeatureGateError(requiredTier?: string, currentTier?: string) {
  const tierName = requiredTier === 'power' ? 'Power' : 'Pro';
  const currentInfo = currentTier && currentTier !== 'free'
    ? `You're currently on the ${currentTier === 'pro' ? 'Pro' : currentTier} plan. `
    : '';

  Alert.alert(
    `${tierName} Feature`,
    `${currentInfo}This feature requires a ${tierName} subscription.`,
    [
      { text: `Upgrade to ${tierName}`, onPress: () => router.push('/paywall') },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
}

/**
 * Check if an API response is a 402 insufficient credits error.
 * If so, show the alert and return true. Otherwise return false.
 */
export async function checkCreditError(response: Response, currentBalance?: number): Promise<boolean> {
  if (response.status === 402) {
    const data = await response.json().catch(() => ({}));
    handleInsufficientCredits(data.required, currentBalance);
    return true;
  }
  return false;
}

/**
 * Check if an API response is a 403 feature gate error.
 * If so, show the upgrade alert and return true. Otherwise return false.
 */
export async function checkFeatureGateError(response: Response): Promise<boolean> {
  if (response.status === 403) {
    const data = await response.json().catch(() => ({}));
    if (data.error === 'FEATURE_GATED') {
      handleFeatureGateError(data.requiredTier, data.currentTier);
      return true;
    }
  }
  return false;
}
