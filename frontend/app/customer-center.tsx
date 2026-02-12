import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CustomerCenterView } from 'react-native-purchases-ui';
import { useSubscription } from '../contexts/SubscriptionContext';
import { ProBadge } from '../components/ProBadge';

export default function CustomerCenterScreen() {
  const router = useRouter();
  const {
    isProUser,
    subscriptionStatus,
    customerInfo,
    handleRestorePurchases,
    refreshSubscriptionStatus,
  } = useSubscription();

  const [isRestoring, setIsRestoring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [useNativeCustomerCenter, setUseNativeCustomerCenter] = useState(true);

  useEffect(() => {
    // Refresh subscription status when screen loads
    refreshSubscriptionStatus();
  }, []);

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      const success = await handleRestorePurchases();

      if (success) {
        await refreshSubscriptionStatus();
        Alert.alert(
          'Purchases Restored',
          'Your purchases have been successfully restored!',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We could not find any previous purchases to restore.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Restore Failed',
        error.message || 'Failed to restore purchases. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refreshSubscriptionStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManageSubscription = () => {
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
    });

    if (url) {
      Linking.openURL(url).catch((err) => {
        Alert.alert('Error', 'Unable to open subscription management');
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getSubscriptionTypeLabel = () => {
    if (subscriptionStatus.isLifetime) return 'Lifetime';
    if (subscriptionStatus.productId?.includes('yearly')) return 'Yearly';
    if (subscriptionStatus.productId?.includes('monthly')) return 'Monthly';
    return 'Unknown';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          style={styles.refreshButton}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <Text style={styles.refreshButtonText}>↻</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* RevenueCat Customer Center (if available) */}
      {useNativeCustomerCenter && isProUser && (
        <CustomerCenterView
          onRestoreCompleted={() => {
            Alert.alert('Success', 'Purchases restored successfully');
            refreshSubscriptionStatus();
          }}
          onRestoreError={(error) => {
            Alert.alert('Error', error.message || 'Failed to restore purchases');
          }}
        />
      )}

      <ScrollView style={styles.content}>
        {/* Subscription Status Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Subscription Status</Text>
            {isProUser && <ProBadge size="small" />}
          </View>

          {isProUser ? (
            <>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Plan:</Text>
                <Text style={styles.statusValue}>{getSubscriptionTypeLabel()}</Text>
              </View>

              {!subscriptionStatus.isLifetime && (
                <>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Status:</Text>
                    <Text style={[styles.statusValue, styles.activeStatus]}>
                      {subscriptionStatus.willRenew ? 'Active' : 'Expires Soon'}
                    </Text>
                  </View>

                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>
                      {subscriptionStatus.willRenew ? 'Renews on:' : 'Expires on:'}
                    </Text>
                    <Text style={styles.statusValue}>
                      {formatDate(subscriptionStatus.expirationDate)}
                    </Text>
                  </View>
                </>
              )}

              {subscriptionStatus.isLifetime && (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Status:</Text>
                  <Text style={[styles.statusValue, styles.lifetimeStatus]}>
                    Lifetime Access
                  </Text>
                </View>
              )}

              {subscriptionStatus.store && (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Store:</Text>
                  <Text style={styles.statusValue}>
                    {subscriptionStatus.store === 'app_store' ? 'App Store' : 'Play Store'}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.freeStatusContainer}>
              <Text style={styles.freeStatusText}>Free Plan</Text>
              <Text style={styles.freeStatusDescription}>
                Upgrade to Pro to unlock unlimited meal plans and premium features
              </Text>
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => router.push('/paywall')}
              >
                <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Actions Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actions</Text>

          {isProUser && !subscriptionStatus.isLifetime && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleManageSubscription}
            >
              <Text style={styles.actionButtonText}>Manage Subscription</Text>
              <Text style={styles.actionButtonArrow}>→</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#333" />
            ) : (
              <>
                <Text style={styles.actionButtonText}>Restore Purchases</Text>
                <Text style={styles.actionButtonArrow}>→</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Pro Features Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pro Features</Text>

          <FeatureItem
            icon="🎯"
            title="Unlimited Meal Plans"
            enabled={isProUser}
          />
          <FeatureItem
            icon="🛒"
            title="Advanced Shopping Lists"
            enabled={isProUser}
          />
          <FeatureItem
            icon="🤖"
            title="AI Recipe Generation"
            enabled={isProUser}
          />
          <FeatureItem
            icon="📊"
            title="Nutrition Tracking"
            enabled={isProUser}
          />
          <FeatureItem
            icon="💾"
            title="Unlimited Recipe Storage"
            enabled={isProUser}
          />
          <FeatureItem
            icon="🔄"
            title="Priority Support"
            enabled={isProUser}
          />
        </View>

        {/* Customer Info (Debug) */}
        {__DEV__ && customerInfo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Debug Info</Text>
            <Text style={styles.debugText}>
              Customer ID: {customerInfo.originalAppUserId}
            </Text>
            <Text style={styles.debugText}>
              Entitlements: {Object.keys(customerInfo.entitlements.active).join(', ') || 'None'}
            </Text>
            <Text style={styles.debugText}>
              Products: {Object.keys(customerInfo.activeSubscriptions).length}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface FeatureItemProps {
  icon: string;
  title: string;
  enabled: boolean;
}

function FeatureItem({ icon, title, enabled }: FeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={[styles.featureTitle, !enabled && styles.featureTitleDisabled]}>
        {title}
      </Text>
      <Text style={styles.featureStatus}>{enabled ? '✓' : '○'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 24,
    color: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    padding: 5,
  },
  refreshButtonText: {
    fontSize: 24,
    color: '#4CAF50',
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    color: '#666',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  activeStatus: {
    color: '#4CAF50',
  },
  lifetimeStatus: {
    color: '#FFD700',
  },
  freeStatusContainer: {
    alignItems: 'center',
  },
  freeStatusText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 10,
  },
  freeStatusDescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
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
  actionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#333',
  },
  actionButtonArrow: {
    fontSize: 16,
    color: '#999',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureTitle: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  featureTitleDisabled: {
    color: '#999',
  },
  featureStatus: {
    fontSize: 18,
    color: '#4CAF50',
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
