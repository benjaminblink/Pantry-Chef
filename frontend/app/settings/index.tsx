import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useCredits } from '../../contexts/CreditContext';
import { ProBadge } from '../../components/ProBadge';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isProUser } = useSubscription();
  const { balance } = useCredits();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* User Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {isProUser && (
              <View style={styles.proBadgeContainer}>
                <ProBadge size="medium" />
              </View>
            )}
          </View>
        </View>

        {/* Credits Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Credits</Text>
          <View style={styles.creditBalanceRow}>
            <Text style={styles.creditCoin}>●</Text>
            <Text style={styles.creditBalanceNumber}>
              {balance !== null ? balance : '--'}
            </Text>
            <Text style={styles.creditBalanceLabel}>credits available</Text>
          </View>
          <Text style={styles.creditHint}>
            Earn credits by shopping with Walmart or upgrade to Pro for monthly credits.
          </Text>
          {!isProUser && (
            <TouchableOpacity
              style={[styles.settingButton, styles.upgradeButton]}
              onPress={() => router.push('/paywall')}
            >
              <View style={styles.settingButtonLeft}>
                <Text style={styles.settingButtonIcon}>⭐</Text>
                <Text style={[styles.settingButtonText, styles.upgradeButtonText]}>
                  Get More Credits
                </Text>
              </View>
              <Text style={styles.settingButtonArrow}>→</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Subscription Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>

          <TouchableOpacity
            style={styles.settingButton}
            onPress={() => router.push('/customer-center')}
          >
            <View style={styles.settingButtonLeft}>
              <Text style={styles.settingButtonIcon}>💳</Text>
              <Text style={styles.settingButtonText}>Manage Subscription</Text>
            </View>
            <Text style={styles.settingButtonArrow}>→</Text>
          </TouchableOpacity>

          {!isProUser && (
            <TouchableOpacity
              style={[styles.settingButton, styles.upgradeButton]}
              onPress={() => router.push('/paywall')}
            >
              <View style={styles.settingButtonLeft}>
                <Text style={styles.settingButtonIcon}>⭐</Text>
                <Text style={[styles.settingButtonText, styles.upgradeButtonText]}>
                  Upgrade to Pro
                </Text>
              </View>
              <Text style={styles.settingButtonArrow}>→</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Preferences Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preferences</Text>

          <TouchableOpacity
            style={styles.settingButton}
            onPress={() => router.push('/settings/meal-preferences')}
          >
            <View style={styles.settingButtonLeft}>
              <Text style={styles.settingButtonIcon}>🍽️</Text>
              <Text style={styles.settingButtonText}>Meal Preferences</Text>
            </View>
            <Text style={styles.settingButtonArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* App Info Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Support</Text>
            <Text style={styles.infoValue}>support@pantrychef.app</Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        {/* Spacer for bottom navigation */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  userInfo: {
    alignItems: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  proBadgeContainer: {
    marginTop: 5,
  },
  creditBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
    gap: 8,
  },
  creditCoin: {
    color: '#FFD700',
    fontSize: 18,
  },
  creditBalanceNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  creditBalanceLabel: {
    fontSize: 14,
    color: '#666',
  },
  creditHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 5,
  },
  settingButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  settingButtonText: {
    fontSize: 16,
    color: '#333',
  },
  settingButtonArrow: {
    fontSize: 16,
    color: '#999',
  },
  upgradeButton: {
    backgroundColor: '#f0f8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    borderBottomWidth: 0,
  },
  upgradeButtonText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
  },
  logoutButton: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  logoutButtonText: {
    fontSize: 16,
    color: '#ff4444',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 100,
  },
});
