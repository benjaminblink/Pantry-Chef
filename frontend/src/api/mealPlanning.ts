// API client for meal planning endpoints

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config';
import { handleInsufficientCredits } from '../../utils/creditErrors';
import type {
  UserPreference,
  PreferenceLibrary,
  ConflictWarning,
  UserInventory,
  MealPlan,
  GenerateWeekParams,
  NutritionSummary,
  ShoppingList
} from '../types/mealPlanning';

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await AsyncStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Preferences API
export async function getUserPreferences(category?: string, active?: boolean): Promise<UserPreference[]> {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (active !== undefined) params.append('active', String(active));

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/preferences?${params}`, { headers });
  const data = await response.json();
  return data.preferences;
}

export async function getPreferenceLibrary(): Promise<PreferenceLibrary> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/preferences/library`, { headers });
  const data = await response.json();
  return data.library;
}

export async function checkPreferenceConflicts(): Promise<ConflictWarning[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/preferences/conflicts`, { headers });
  const data = await response.json();
  return data.conflicts;
}

export async function createPreferenceFromLibrary(key: string): Promise<UserPreference> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_URL}/preferences/from-library/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    console.error('Create preference error:', error);
    throw new Error(error.message || `Failed to create preference (${response.status})`);
  }

  const data = await response.json();
  return data.preference;
}

export async function updatePreference(
  id: string,
  updates: { value?: any; isActive?: boolean; isPinned?: boolean }
): Promise<UserPreference> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_URL}/preferences/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(updates)
  });
  const data = await response.json();
  return data.preference;
}

export async function deletePreference(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/preferences/${id}`, {
    method: 'DELETE',
    headers
  });
}

// Inventory API
export async function getUserInventory(available?: boolean): Promise<UserInventory[]> {
  const params = new URLSearchParams();
  if (available !== undefined) params.append('available', String(available));

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/inventory?${params}`, { headers });
  const data = await response.json();
  return data.inventory;
}

export async function addInventoryItem(
  ingredientId: string,
  amount: string,
  unit?: string,
  expiresAt?: string
): Promise<UserInventory> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_URL}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ ingredientId, amount, unit, expiresAt })
  });
  const data = await response.json();
  return data.inventory;
}

export async function updateInventoryItem(
  id: string,
  updates: { amount?: string; unit?: string; isAvailable?: boolean }
): Promise<UserInventory> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_URL}/inventory/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(updates)
  });
  const data = await response.json();
  return data.inventory;
}

export async function removeInventoryItem(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/inventory/${id}`, {
    method: 'DELETE',
    headers
  });
}

// Meal Planning API
export async function generateRecipeIdeas(
  params: GenerateWeekParams
): Promise<{
  ideas: Array<{ title: string; description: string; mealType: string; promptVariation: string }>;
  existingRecipeCount: number;
  newRecipeCount: number;
}> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans/generate-ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 402) {
      handleInsufficientCredits(error.required);
      throw new Error('INSUFFICIENT_CREDITS');
    }
    throw new Error(error.message || 'Failed to generate recipe ideas');
  }

  const data = await response.json();
  return data;
}

export async function generateWeeklyMealPlan(
  params: GenerateWeekParams & {
    approvedIdeas?: Array<{ title: string; description: string; mealType: string; promptVariation: string }>;
  }
): Promise<{
  mealPlan: MealPlan;
  usedRecipes: number;
  newRecipes: number;
  newIngredients: string[];
  inventoryUsed: number;
}> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans/generate-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 402) {
      handleInsufficientCredits(error.required);
      throw new Error('INSUFFICIENT_CREDITS');
    }
    throw new Error(error.message || 'Failed to generate meal plan');
  }

  const data = await response.json();
  return data;
}

export async function getMealPlans(
  active?: boolean,
  limit: number = 20,
  offset: number = 0
): Promise<MealPlan[]> {
  const params = new URLSearchParams();
  if (active !== undefined) params.append('active', String(active));
  params.append('limit', String(limit));
  params.append('offset', String(offset));

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans?${params}`, { headers });
  const data = await response.json();
  return data.mealPlans;
}

export async function getMealPlan(id: string): Promise<{
  mealPlan: MealPlan;
  nutrition: NutritionSummary;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans/${id}`, { headers });
  const data = await response.json();
  return data;
}

export async function updateMealSlot(
  mealPlanId: string,
  slotId: string,
  updates: { recipeId?: string; notes?: string }
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  await fetch(`${API_URL}/meal-plans/${mealPlanId}/slots/${slotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(updates)
  });
}

export async function deleteMealPlan(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/meal-plans/${id}`, {
    method: 'DELETE',
    headers
  });
}

export async function generateShoppingList(mealPlanId: string): Promise<{
  shoppingListId: string;
  items: any[];
  totalEstimatedCost: number;
  potentialMerges?: any[];
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans/${mealPlanId}/shopping-list`, {
    method: 'POST',
    headers
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate shopping list');
  }

  const data = await response.json();
  return data;
}

export async function getShoppingList(id: string): Promise<{
  shoppingList: ShoppingList;
  groupedByCategory: Record<string, any[]>;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/meal-plans/shopping-lists/${id}`, { headers });

  if (!response.ok) {
    const error = await response.json();
    console.error('Get shopping list error:', error);
    throw new Error(error.message || `Failed to fetch shopping list (${response.status})`);
  }

  const data = await response.json();
  console.log('Shopping list response:', JSON.stringify(data, null, 2));
  return data;
}

export async function markShoppingItemPurchased(
  listId: string,
  itemId: string,
  isPurchased: boolean,
  actualPrice?: number
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  await fetch(`${API_URL}/meal-plans/shopping-lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ isPurchased, actualPrice })
  });
}
