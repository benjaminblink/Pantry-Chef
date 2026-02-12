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
} from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { useSubscription } from '../contexts/SubscriptionContext';

export default function PaywallScreen() {
  const router = useRouter();
  const { isProUser, currentOffering, handleRestorePurchases, refreshSubscriptionStatus } = useSubscription();
  const [isRestoring, setIsRestoring] = useState(false);
  const [useNativePaywall, setUseNativePaywall] = useState(true);

  useEffect(() => {
    console.log('💳 PaywallScreen mounted', {
      isProUser,
      hasOffering: !!currentOffering,
      offeringId: currentOffering?.identifier
    });
  }, []);

  // If user becomes Pro (purchase completed), navigate back
  useEffect(() => {
    if (isProUser) {
      console.log('ℹ️ User is Pro - navigating back');
      // Use setTimeout to ensure we're not in the middle of a render
      setTimeout(() => {
        router.back();
      }, 100);
    }
  }, [isProUser]);

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      const success = await handleRestorePurchases();

      if (success) {
        await refreshSubscriptionStatus();

        Alert.alert(
          'Purchases Restored',
          'Your purchases have been successfully restored!',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
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

  const handlePurchaseCompleted = async () => {
    console.log('✅ Purchase completed successfully!');
    try {
      // Refresh subscription status (this triggers backend sync)
      await refreshSubscriptionStatus();
      console.log('✅ Subscription status refreshed');

      Alert.alert(
        'Welcome to Pro!',
        'Thank you for subscribing to Pantry Chef Pro!',
        [
          {
            text: 'Get Started',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('❌ Error after purchase:', error);
      // Still show success - the purchase went through
      Alert.alert(
        'Welcome to Pro!',
        'Thank you for subscribing to Pantry Chef Pro!',
        [
          {
            text: 'Get Started',
            onPress: () => router.back(),
          },
        ]
      );
    }
  };

  const handlePurchaseError = (error: any) => {
    console.log('🔴 handlePurchaseError called with:', JSON.stringify(error, null, 2));

    // Extract error details
    const errorCode = error?.error?.code || error?.code;
    const readableCode = error?.error?.readableErrorCode || error?.readableErrorCode;
    const message = error?.error?.message || error?.message;
    const userCancelled = error?.userCancelled || error?.error?.userCancelled;

    console.log('🔴 Error details:', { errorCode, readableCode, message, userCancelled });

    // Don't show alert if user cancelled
    if (userCancelled) {
      console.log('🔴 User cancelled purchase');
      return;
    }

    // In development: handle test store simulated errors silently
    if (__DEV__) {
      if (errorCode === 42 || readableCode === 'TestStoreSimulatedPurchaseError') {
        // Test store randomly simulates failures - ignore them silently in dev
        console.log('🟡 Test store simulated purchase failure - this is expected behavior');
        return;
      }
    }

    // Show error for real failures (production) or non-test errors (dev)
    console.log('🔴 Showing error alert to user');
    Alert.alert(
      'Purchase Failed',
      message || 'Something went wrong. Please try again.',
      [{ text: 'OK' }]
    );
  };

  if (isProUser) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upgrade to Pro</Text>
      </View>

      {/* RevenueCat Paywall */}
      {currentOffering && useNativePaywall ? (
        <RevenueCatUI.Paywall
          options={{ offering: currentOffering }}
          onPurchaseCompleted={handlePurchaseCompleted}
          onPurchaseError={handlePurchaseError}
          onRestoreCompleted={() => {
            Alert.alert('Purchases Restored', 'Your purchases have been restored!');
            router.back();
          }}
          onRestoreError={(error) => {
            Alert.alert('Restore Failed', error.message || 'Failed to restore purchases');
          }}
          onDismiss={() => router.back()}
        />
      ) : (
        <ScrollView style={styles.content}>
          {/* Fallback custom paywall if offering not loaded */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>Pantry Chef Pro</Text>
            <Text style={styles.heroSubtitle}>
              Unlock unlimited meal planning and premium features
            </Text>
          </View>

          {/* Features List */}
          <View style={styles.featuresSection}>
            <Text style={styles.sectionTitle}>Pro Features</Text>

            <FeatureItem
              icon="🎯"
              title="Unlimited Meal Plans"
              description="Create as many AI-powered meal plans as you want"
            />
            <FeatureItem
              icon="🛒"
              title="Advanced Shopping Lists"
              description="Smart ingredient merging and Walmart integration"
            />
            <FeatureItem
              icon="🤖"
              title="AI Recipe Generation"
              description="Get personalized recipes based on your preferences"
            />
            <FeatureItem
              icon="📊"
              title="Nutrition Tracking"
              description="Track macros and nutritional information"
            />
            <FeatureItem
              icon="💾"
              title="Unlimited Recipe Storage"
              description="Save and organize unlimited custom recipes"
            />
            <FeatureItem
              icon="🔄"
              title="Priority Support"
              description="Get help faster with priority customer support"
            />
          </View>

          {/* Pricing Info */}
          {!currentOffering && (
            <View style={styles.loadingSection}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Loading subscription options...</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Footer Actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleRestore}
          disabled={isRestoring}
          style={styles.restoreButton}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color="#666" />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By subscribing, you agree to our Terms of Service and Privacy Policy.
          Subscriptions automatically renew unless cancelled.
        </Text>
      </View>
    </View>
  );
}

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  closeButton: {
    position: 'absolute',
    left: 20,
    top: Platform.OS === 'ios' ? 50 : 20,
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  heroSection: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#4CAF50',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },
  featuresSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 15,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  loadingSection: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  restoreButton: {
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  restoreButtonText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
