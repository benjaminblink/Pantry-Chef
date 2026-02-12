import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await AsyncStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ReceiptItem {
  name: string;
  amount: string;
  unit?: string;
  estimatedPrice?: number;
}

export interface ReceiptImportItem {
  ingredientId?: string;
  name: string;
  amount: string;
  unit?: string;
  expiresAt?: string;
}

export interface ScanReceiptResponse {
  success: boolean;
  items: ReceiptItem[];
  balance: number;
}

export interface ImportReceiptItemsResponse {
  success: boolean;
  created: number;
  updated: number;
  message: string;
}

export async function scanReceipt(imageBase64: string): Promise<ScanReceiptResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/inventory/scan-receipt`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ imageBase64 })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to scan receipt');
  }

  return response.json();
}

export async function importReceiptItems(items: ReceiptImportItem[]): Promise<ImportReceiptItemsResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/inventory/import-receipt-items`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to import receipt items');
  }

  return response.json();
}

export interface QuickCookRecipe {
  id: string;
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients: Array<{
    id: string;
    name: string;
    amount: string;
    unit: string;
    inPantry?: boolean;
  }>;
}

export interface QuickCookResponse {
  success: boolean;
  recipes: QuickCookRecipe[];
  balance: number;
}

export async function quickCook(count: number = 3): Promise<QuickCookResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/inventory/quick-cook`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ count })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate recipes');
  }

  return response.json();
}

export interface DeductedItem {
  ingredientId: string;
  ingredientName: string;
  amountDeducted: number;
  unit: string;
  remainingAmount: number;
}

export interface CompleteMealPlanResponse {
  success: boolean;
  mealPlan: any;
  deductedItems: DeductedItem[];
  message: string;
}

export async function completeMealPlan(
  mealPlanId: string,
  completedSlotIds: string[]
): Promise<CompleteMealPlanResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans/${mealPlanId}/complete`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ completedMealSlotIds: completedSlotIds })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to complete meals');
  }

  return response.json();
}
