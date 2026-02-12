// Shopping List Aggregator Service
// Consolidates ingredients across multiple recipes into a single shopping list
// Handles ingredient merging, unit conversions, and price estimation

import { prisma } from '../index.js';
import { detectSimilarIngredients, applyMergeDecisionsByIds, type CartItem, type PotentialMerge } from './ingredientSimilarity.js';

export interface ConsolidatedItem {
  ingredientId: string;
  ingredient: any;
  totalAmount: string;
  unit: string;
  walmartItemId?: string;
  estimatedPrice?: number;
  recipeBreakdown?: RecipeBreakdownItem[];
}

export interface RecipeBreakdownItem {
  recipeId: string;
  recipeTitle: string;
  amount: number;
  unit: string;
}

export interface PreviousMergeDecision {
  ingredientIds: string[];
  decision: 'merge' | 'keep_separate';
}

export interface ShoppingListResult {
  shoppingListId: string;
  items: ConsolidatedItem[];
  totalEstimatedCost: number;
  potentialMerges: PotentialMerge[];
}

/**
 * Get all previous merge decisions for a user's shopping lists
 * Returns a map of sorted ingredient ID sets to their decision
 * This allows us to remember user preferences across shopping lists
 */
async function getPreviousMergeDecisions(userId: string): Promise<Map<string, 'merge' | 'keep_separate'>> {
  // Get all previous shopping lists for this user with merge decisions
  const previousShoppingLists = await prisma.shoppingList.findMany({
    where: {
      mealPlan: {
        userId
      }
    },
    include: {
      mergeOptions: {
        where: {
          userDecision: {
            not: null
          }
        }
      }
    }
  });

  const decisionsMap = new Map<string, 'merge' | 'keep_separate'>();

  for (const shoppingList of previousShoppingLists) {
    for (const mergeOption of shoppingList.mergeOptions) {
      if (mergeOption.userDecision) {
        // Create a sorted key from ingredient IDs to match similar merges
        const key = [...mergeOption.ingredientIds].sort().join('|');
        decisionsMap.set(key, mergeOption.userDecision as 'merge' | 'keep_separate');
      }
    }
  }

  console.log(`Found ${decisionsMap.size} previous merge decisions for user ${userId}`);
  return decisionsMap;
}

/**
 * Check if a potential merge matches a previous user decision
 * Uses sorted ingredient IDs as the matching key
 */
function findMatchingDecision(
  merge: PotentialMerge,
  previousDecisions: Map<string, 'merge' | 'keep_separate'>
): 'merge' | 'keep_separate' | null {
  const ingredientIds = merge.ingredients.map(i => i.ingredientId).sort();
  const key = ingredientIds.join('|');
  return previousDecisions.get(key) || null;
}

/**
 * Generate consolidated shopping list from a meal plan
 *
 * Process:
 * 1. Aggregate all ingredients from meal plan recipes
 * 2. Detect similar ingredients that could be merged
 * 3. Apply previous user merge decisions automatically
 * 4. Optionally exclude items already in user's pantry
 * 5. Return shopping list with merge suggestions for new combinations
 *
 * @param mealPlanId - ID of the meal plan to generate shopping list for
 * @param excludePantry - Whether to exclude items already in pantry (default: false)
 * @returns Shopping list with consolidated items and merge suggestions
 */
export async function generateShoppingList(mealPlanId: string, excludePantry: boolean = false): Promise<ShoppingListResult> {
  // Get all recipes from meal plan
  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    include: {
      mealSlots: {
        include: {
          recipe: {
            include: {
              recipeIngredients: {
                include: { ingredient: true }
              }
            }
          }
        }
      }
    }
  });

  if (!mealPlan) {
    throw new Error('Meal plan not found');
  }

  // Get user's previous merge decisions to auto-apply them
  const userId = mealPlan.userId;
  const previousDecisions = await getPreviousMergeDecisions(userId);

  // Build ingredient list for similarity detection
  const ingredientMap = new Map<string, CartItem>();

  for (const slot of mealPlan.mealSlots) {
    if (!slot.recipe) continue;

    for (const ri of slot.recipe.recipeIngredients) {
      const key = ri.ingredientId;

      if (ingredientMap.has(key)) {
        // Same ingredient ID, same unit - combine amounts
        const existing = ingredientMap.get(key)!;

        if (existing.unit === ri.unit) {
          // Same unit - simple addition
          existing.amount += ri.amount;
        } else {
          // Different units - keep separate for now, let merge detection handle conversion
          existing.amount += ri.amount;
          // Keep existing unit - merge detection will handle unit conversion
        }

        existing.recipes.push(slot.recipe.title);

        // Add to recipe breakdown
        if (!existing.recipeBreakdown) {
          existing.recipeBreakdown = [];
        }
        existing.recipeBreakdown.push({
          recipeId: slot.recipeId!,
          recipeTitle: slot.recipe.title,
          amount: ri.amount,
          unit: ri.unit,
        });
      } else {
        // First occurrence - create new cart item
        ingredientMap.set(key, {
          ingredientId: ri.ingredientId,
          ingredientName: ri.ingredient.name,
          amount: ri.amount,
          unit: ri.unit,
          walmartItemId: ri.ingredient.walmartItemId,
          walmartSearchTerm: ri.ingredient.walmartSearchTerm,
          recipes: [slot.recipe.title],
          recipeBreakdown: [{
            recipeId: slot.recipeId!,
            recipeTitle: slot.recipe.title,
            amount: ri.amount,
            unit: ri.unit,
          }],
        });
      }
    }
  }

  let ingredients = Array.from(ingredientMap.values());

  // Exclude pantry items if requested
  if (excludePantry) {
    const pantryItems = await prisma.userInventory.findMany({
      where: {
        userId,
        isAvailable: true
      },
      include: {
        ingredient: true
      }
    });

    console.log(`Filtering out ${pantryItems.length} pantry items from shopping list...`);

    // Create a set of pantry ingredient IDs for fast lookup
    const pantryIngredientIds = new Set(pantryItems.map(item => item.ingredientId));

    // Filter out ingredients that are in the pantry
    ingredients = ingredients.filter(item => !pantryIngredientIds.has(item.ingredientId));

    console.log(`Shopping list reduced from ${ingredientMap.size} to ${ingredients.length} items after pantry exclusion`);
  }

  console.log(`Detecting similar ingredients in shopping list (${ingredients.length} total)...`);

  // Run similarity detection in background to build cache (don't block shopping list generation)
  // This prevents timeout issues while still building up the cache for future use
  detectSimilarIngredients(ingredients, previousDecisions)
    .then(() => console.log('Background similarity detection complete'))
    .catch(err => console.error('Background similarity detection failed:', err));

  // For now, skip merge suggestions to avoid timeout - just return all ingredients
  // TODO: Re-enable merge suggestions once cache is fully built
  const potentialMergesWithHistory: any[] = [];

  console.log(`Skipping merge suggestions (running similarity detection in background for caching)`);

  // Use all ingredients as-is (no merging)
  const finalIngredients = ingredients;

  // Convert to consolidated items format
  const consolidatedItems: ConsolidatedItem[] = finalIngredients.map(item => ({
    ingredientId: item.ingredientId,
    ingredient: { name: item.ingredientName },
    totalAmount: item.amount.toString(),
    unit: item.unit,
    walmartItemId: item.walmartItemId || undefined,
    estimatedPrice: 0, // TODO: Fetch from Walmart API
    recipeBreakdown: item.recipeBreakdown
  }));

  // Calculate total estimated cost
  const totalCost = consolidatedItems.reduce(
    (sum, item) => sum + (item.estimatedPrice || 0),
    0
  );

  // Deactivate any existing active cart for this user
  await prisma.shoppingList.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });

  // Save to database
  const shoppingList = await prisma.shoppingList.create({
    data: {
      userId,
      mealPlanId,
      source: 'meal_plan',
      isActive: true,
      totalEstimatedCost: totalCost,
      items: {
        create: consolidatedItems.map(item => ({
          ingredientId: item.ingredientId,
          totalAmount: item.totalAmount,
          unit: item.unit,
          walmartItemId: item.walmartItemId,
          estimatedPrice: item.estimatedPrice
        }))
      },
      // Save merge options with previous decisions pre-filled
      // User can still override these in the UI if they want
      mergeOptions: {
        create: potentialMergesWithHistory.map(merge => ({
          mergeId: merge.mergeId,
          ingredientIds: merge.ingredients.map((i: CartItem) => i.ingredientId),
          canonicalUnit: merge.canonicalUnit || merge.unit,
          conversionRatios: merge.conversionRatios || merge.ingredients.map(() => 1.0),
          userDecision: merge.previousDecision || null // Pre-fill if exists, otherwise null
        }))
      }
    },
    include: {
      items: { include: { ingredient: true } },
      mergeOptions: true
    }
  });

  console.log(`Shopping list ${shoppingList.id} created with ${potentialMergesWithHistory.length} merge options`);

  return {
    shoppingListId: shoppingList.id,
    items: consolidatedItems,
    totalEstimatedCost: totalCost,
    potentialMerges: potentialMergesWithHistory
  };
}

/**
 * Consolidate amounts with the same unit
 * Helper function for aggregating ingredient quantities
 */
function consolidateAmounts(amounts: { amount: number; unit: string }[]): { amount: string; unit: string } {
  if (amounts.length === 0) {
    return { amount: '0', unit: '' };
  }

  // Group by unit
  const byUnit = amounts.reduce((acc, { amount, unit }) => {
    if (!acc[unit]) acc[unit] = 0;
    acc[unit] += amount;
    return acc;
  }, {} as Record<string, number>);

  // Find the most common unit
  const entries = Object.entries(byUnit);
  if (entries.length === 1) {
    const [unit, total] = entries[0];
    return { amount: total.toFixed(2), unit };
  }

  // If multiple units, use the first unit as primary
  const primaryUnit = amounts[0].unit;
  const primaryTotal = byUnit[primaryUnit] || 0;

  // List other units separately
  const otherUnits = entries
    .filter(([unit]) => unit !== primaryUnit)
    .map(([unit, amount]) => `${amount.toFixed(2)} ${unit}`)
    .join(', ');

  const amountStr = otherUnits
    ? `${primaryTotal.toFixed(2)} (+ ${otherUnits})`
    : primaryTotal.toFixed(2);

  return { amount: amountStr, unit: primaryUnit };
}

/**
 * Get shopping list by ID with grouped items
 * Groups items by ingredient category for better organization
 */
export async function getShoppingList(shoppingListId: string) {
  const shoppingList = await prisma.shoppingList.findUnique({
    where: { id: shoppingListId },
    include: {
      items: {
        include: { ingredient: true }
      },
      mealPlan: true,
      mergeOptions: true
    }
  });

  if (!shoppingList) {
    throw new Error('Shopping list not found');
  }

  // Group items by category for organized display
  const groupedByCategory = shoppingList.items.reduce((acc: Record<string, typeof shoppingList.items>, item) => {
    const category = item.ingredient.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return {
    shoppingList,
    groupedByCategory
  };
}

/**
 * Save user's merge decision for a shopping list merge option
 * This decision will be remembered for future shopping lists
 *
 * @param shoppingListId - ID of the shopping list
 * @param mergeId - ID of the merge option
 * @param decision - User's decision: 'merge' or 'keep_separate'
 */
export async function saveMergeDecision(
  shoppingListId: string,
  mergeId: string,
  decision: 'merge' | 'keep_separate'
): Promise<void> {
  await prisma.shoppingListMergeOption.updateMany({
    where: {
      shoppingListId,
      mergeId
    },
    data: {
      userDecision: decision
    }
  });

  console.log(`Saved merge decision for ${mergeId}: ${decision}`);
}

/**
 * Apply all merge decisions to a shopping list
 * Takes user's decisions and re-generates the shopping list with merges applied
 *
 * @param shoppingListId - ID of the shopping list
 * @param decisions - Array of merge decisions from user
 */
export async function applyAllMergeDecisions(
  shoppingListId: string,
  decisions: Array<{ mergeId: string; decision: 'merge' | 'keep_separate' }>
): Promise<ConsolidatedItem[]> {
  // Save all decisions to database
  for (const { mergeId, decision } of decisions) {
    await saveMergeDecision(shoppingListId, mergeId, decision);
  }

  // Get the shopping list with all merge options
  const shoppingList = await prisma.shoppingList.findUnique({
    where: { id: shoppingListId },
    include: {
      items: { include: { ingredient: true } },
      mergeOptions: true
    }
  });

  if (!shoppingList) {
    throw new Error('Shopping list not found');
  }

  // Convert items to CartItem format
  const cartItems: CartItem[] = shoppingList.items.map(item => ({
    ingredientId: item.ingredientId,
    ingredientName: item.ingredient.name,
    amount: parseFloat(item.totalAmount),
    unit: item.unit,
    walmartItemId: item.walmartItemId || undefined,
    walmartSearchTerm: item.ingredient.walmartSearchTerm || undefined,
    recipes: []
  }));

  // Build merge decisions map
  const mergeDecisionsMap = new Map<string, 'merge' | 'keep_separate'>();
  for (const mergeOption of shoppingList.mergeOptions) {
    if (mergeOption.userDecision) {
      const key = [...mergeOption.ingredientIds].sort().join('|');
      mergeDecisionsMap.set(key, mergeOption.userDecision as 'merge' | 'keep_separate');
    }
  }

  // Apply merge decisions
  const mergedItems = applyMergeDecisionsByIds(
    cartItems,
    Array.from(mergeDecisionsMap.entries()).map(([ids, decision]) => ({
      ingredientIds: ids.split('|'),
      decision
    }))
  );

  // Convert back to consolidated items
  const consolidatedItems: ConsolidatedItem[] = mergedItems.map(item => ({
    ingredientId: item.ingredientId,
    ingredient: { name: item.ingredientName },
    totalAmount: item.amount.toString(),
    unit: item.unit,
    walmartItemId: item.walmartItemId || undefined,
    estimatedPrice: 0
  }));

  return consolidatedItems;
}

/**
 * Mark shopping list item as purchased
 * Allows tracking what has been bought and updating actual prices
 *
 * @param itemId - ID of the shopping list item
 * @param isPurchased - Whether the item has been purchased
 * @param actualPrice - Optional actual price paid (if different from estimate)
 */
export async function markItemPurchased(
  itemId: string,
  isPurchased: boolean,
  actualPrice?: number
): Promise<void> {
  await prisma.shoppingListItem.update({
    where: { id: itemId },
    data: {
      isPurchased,
      ...(actualPrice !== undefined && { estimatedPrice: actualPrice })
    }
  });
}

/**
 * Delete a shopping list
 * Removes shopping list and all associated items and merge options
 */
export async function deleteShoppingList(shoppingListId: string): Promise<void> {
  await prisma.shoppingList.delete({
    where: { id: shoppingListId }
  });

  console.log(`Deleted shopping list ${shoppingListId}`);
}

/**
 * Get all shopping lists for a meal plan
 * Useful for showing shopping list history
 */
export async function getShoppingListsForMealPlan(mealPlanId: string) {
  const shoppingLists = await prisma.shoppingList.findMany({
    where: { mealPlanId },
    include: {
      items: {
        include: { ingredient: true }
      },
      mergeOptions: true
    },
    orderBy: {
      generatedAt: 'desc'
    }
  });

  return shoppingLists;
}
