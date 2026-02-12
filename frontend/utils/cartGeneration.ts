import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecipeSelection {
  recipeId: string;
  quantity: number;
}

export interface CartGenerationResult {
  shoppingListId: string;
  shouldShowMergeReview: boolean;
  recipes: any[];
  ingredients: any[];
  potentialMerges?: any[];
}

/**
 * Generate cart with auto-merge and return navigation info
 * Shared logic used by both shopping cart and meal plan flows
 */
export async function generateCartWithMergeDetection(
  recipeSelections: RecipeSelection[],
  clearCart: boolean = true
): Promise<CartGenerationResult> {
  const token = await AsyncStorage.getItem('authToken');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/cart/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipes: recipeSelections, clearCart }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate cart');
  }

  return {
    shoppingListId: data.shoppingListId,
    shouldShowMergeReview: data.potentialMerges && data.potentialMerges.length > 0,
    recipes: data.recipes,
    ingredients: data.ingredients,
    potentialMerges: data.potentialMerges,
  };
}

/**
 * Navigate to appropriate screen based on merge detection result
 */
export function navigateAfterCartGeneration(
  router: any,
  result: CartGenerationResult,
  clearCart: boolean = true
) {
  if (result.shouldShowMergeReview) {
    // Navigate to merge review screen
    router.push({
      pathname: '/merge-review',
      params: {
        shoppingListId: result.shoppingListId,
        recipes: JSON.stringify(result.recipes),
        ingredients: JSON.stringify(result.ingredients),
        potentialMerges: JSON.stringify(result.potentialMerges),
        clearCart: clearCart.toString(),
      },
    });
  } else {
    // No merges to review, go directly to cart review with ingredients
    router.push({
      pathname: '/shopping-cart',
      params: {
        shoppingListId: result.shoppingListId,
        recipes: JSON.stringify(result.recipes),
        ingredients: JSON.stringify(result.ingredients),
        clearCart: clearCart.toString(),
      },
    });
  }
}
