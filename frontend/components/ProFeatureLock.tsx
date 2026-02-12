import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSubscription } from '../contexts/SubscriptionContext';
import { ProBadge } from './ProBadge';

interface ProFeatureLockProps {
  children: React.ReactNode;
  featureName: string;
  description?: string;
  style?: ViewStyle;
  onUnlock?: () => void;
}

/**
 * Component that locks a feature behind Pro subscription
 * Shows the feature if user is Pro, otherwise shows upgrade prompt
 */
export function ProFeatureLock({
  children,
  featureName,
  description,
  style,
  onUnlock,
}: ProFeatureLockProps) {
  const { isProUser } = useSubscription();
  const router = useRouter();

  const handleUpgrade = () => {
    if (onUnlock) {
      onUnlock();
    }
    router.push('/paywall');
  };

  if (isProUser) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.lockOverlay}>
        <View style={styles.lockContent}>
          <Text style={styles.lockIcon}>🔒</Text>
          <ProBadge size="large" style={styles.badge} />
          <Text style={styles.featureName}>{featureName}</Text>
          {description && (
            <Text style={styles.description}>{description}</Text>
          )}
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
          >
            <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.blurredContent} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

interface RequireProProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Simple component that only renders children if user is Pro
 * Optionally shows fallback content for non-Pro users
 */
export function RequirePro({ children, fallback }: RequireProProps) {
  const { isProUser } = useSubscription();

  if (isProUser) {
    return <>{children}</>;
  }

  return <>{fallback || null}</>;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  lockContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  badge: {
    marginBottom: 15,
  },
  featureName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  upgradeButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  blurredContent: {
    opacity: 0.3,
  },
});
