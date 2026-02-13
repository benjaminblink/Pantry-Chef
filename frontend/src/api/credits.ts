import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config';

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await AsyncStorage.getItem('authToken');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function getCreditBalance(): Promise<number> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/credits/balance`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Failed to get balance (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.message || 'Failed to get balance');
  return data.balance;
}

export interface CreditStatus {
  balance: number;
  isProUser: boolean;
  isPowerUser: boolean;
  subscriptionTier: 'pro' | 'power' | null;
  totalWalmartCheckouts: number;
  memberSince: string;
  recentTransactions: CreditTransaction[];
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export async function getCreditStatus(): Promise<CreditStatus> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/credits/status`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Failed to get credit status (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.message || 'Failed to get credit status');
  return {
    balance: data.balance,
    isProUser: data.isProUser,
    isPowerUser: data.isPowerUser,
    subscriptionTier: data.subscriptionTier,
    totalWalmartCheckouts: data.totalWalmartCheckouts,
    memberSince: data.memberSince,
    recentTransactions: data.recentTransactions,
  };
}

export async function getTransactions(options?: {
  limit?: number;
  offset?: number;
  type?: string;
}): Promise<{ transactions: CreditTransaction[]; total: number }> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.offset) params.append('offset', String(options.offset));
  if (options?.type) params.append('type', options.type);

  const response = await fetch(`${API_URL}/credits/transactions?${params}`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Failed to get transactions (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.message || 'Failed to get transactions');
  return { transactions: data.transactions, total: data.total };
}

/**
 * Sync subscription status with backend (for testing and immediate feedback)
 * In production, webhooks handle this automatically
 */
export async function syncSubscriptionStatus(
  tier: 'pro' | 'power' | null,
  entitlements?: string[]
): Promise<{ balance: number; tier: 'pro' | 'power' | null }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/credits/sync-subscription`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tier, entitlements }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Failed to sync subscription (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.message || 'Failed to sync subscription');
  return { balance: data.balance, tier: data.tier };
}
