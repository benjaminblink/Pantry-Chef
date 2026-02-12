import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getCreditBalance } from '../src/api/credits';
import { useAuth } from './AuthContext';

interface CreditContextType {
  balance: number | null;
  loading: boolean;
  refreshBalance: () => Promise<void>;
}

const CreditContext = createContext<CreditContextType | undefined>(undefined);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!isAuthenticated) {
      setBalance(null);
      return;
    }

    try {
      setLoading(true);
      const b = await getCreditBalance();
      setBalance(b);
    } catch (error) {
      console.error('CreditContext: Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch balance when auth state changes
  useEffect(() => {
    if (isAuthenticated) {
      refreshBalance();
    } else {
      setBalance(null);
    }
  }, [isAuthenticated]);

  const value: CreditContextType = {
    balance,
    loading,
    refreshBalance,
  };

  return (
    <CreditContext.Provider value={value}>
      {children}
    </CreditContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditContext);
  if (context === undefined) {
    throw new Error('useCredits must be used within a CreditProvider');
  }
  return context;
}
