/**
 * Ingredient similarity detection service
 * Identifies potential duplicate ingredients that should be merged
 */

import { getCanonicalName } from '../utils/ingredientNormalizer.js';
import { executeAIPrompt } from './openai.js';
import { findCommonUnit, convertIngredientAmount } from '../utils/ingredientConversions.js';
import {
  getCachedComparison,
  cacheComparison,
  getAllComparisonsFor,
  normalizeIngredientName,
  type ComparisonResult
} from './ingredientComparisonCache.js';

export interface RecipeBreakdown {
  recipeId: string;
  recipeTitle: string;
  amount: number;
  unit: string;
}

export interface CartItem {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
  purchaseQuantity?: number;
  walmartItemId?: string | null;
  walmartSearchTerm?: string | null;
  walmartProduct?: {
    itemId: number;
    name: string;
    salePrice: number;
    thumbnailImage?: string;
    productTrackingUrl?: string;
    size?: string;
  };
  packageCount?: number;
  packageSize?: string;
  recipes: string[];
  recipeBreakdown?: RecipeBreakdown[];
}

export interface PotentialMerge {
  mergeId: string;
  ingredients: CartItem[];
  similarity: number;
  reason: string;
  suggestedName: string;
  totalAmount: number;
  unit: string;
  canonicalUnit?: string;
  conversionRatios?: number[];
  walmartItemId?: string;
}

export interface MergeDetectionResult {
  autoMerged: CartItem[];
  suggestedMerges: PotentialMerge[];
  noMerge: CartItem[];
}


/**
 * Compare two ingredients using AI (pairwise comparison)
 * Returns the comparison result with conversion ratios if units differ
 */
async function compareTwoIngredientsWithAI(
  ingredient1: string,
  ingredient2: string,
  unit1: string,
  unit2: string
): Promise<ComparisonResult> {
  try {
    const systemPrompt = 'You are an expert chef helping determine if two ingredients should be merged in a shopping list. Return valid JSON only.';

    const needsConversion = unit1 !== unit2;

    const userPrompt = `Compare these two ingredients:
1. "${ingredient1}" (${unit1})
2. "${ingredient2}" (${unit2})

Determine if they should be merged in a shopping list:
- "same": Essentially identical, just minor variation (e.g., "fresh salmon" vs "salmon"). Auto-merge.
- "similar": Different form/variation that user might want to merge (e.g., "broccoli florets" vs "broccoli"). Ask user.
- "different": Completely different items (e.g., "black pepper" vs "bell pepper"). Don't merge.

${needsConversion ? `The ingredients have different units. If they can be merged, provide:
- canonicalUnit: The best unit to use (e.g., "cup", "oz", "whole")
- conversionRatio1: Ratio to convert ingredient 1's unit to canonicalUnit
- conversionRatio2: Ratio to convert ingredient 2's unit to canonicalUnit

Example: For "4 whole lemons" and "0.375 cup lemon juice" with canonicalUnit "cup":
- conversionRatio1: 0.25 (1 whole lemon = 0.25 cup juice)
- conversionRatio2: 1.0 (already in cups)
` : ''}

Return JSON format:
{
  "status": "same|similar|different"${needsConversion ? ',\n  "conversionRatio1": 0.25,\n  "conversionRatio2": 1.0,\n  "canonicalUnit": "cup"' : ''}
}`;

    const answer = await executeAIPrompt({
      systemPrompt,
      userPrompt,
      maxTokens: 1000,
      jsonMode: true,
    });

    const parsed = JSON.parse(answer);

    console.log(`  AI comparison: "${ingredient1}" vs "${ingredient2}" → ${parsed.status.toUpperCase()}`);
    if (parsed.canonicalUnit) {
      console.log(`    Canonical unit: ${parsed.canonicalUnit} (ratios: ${parsed.conversionRatio1}, ${parsed.conversionRatio2})`);
    }

    return {
      status: parsed.status as 'same' | 'similar' | 'different',
      conversionRatio1: parsed.conversionRatio1,
      conversionRatio2: parsed.conversionRatio2,
      canonicalUnit: parsed.canonicalUnit,
    };
  } catch (error) {
    console.error('AI comparison failed:', error);
    return {
      status: 'different', // Conservative fallback: don't merge on error
    };
  }
}

/**
 * NEW DB-FIRST APPROACH
 * For each ingredient, check the DB for known comparisons
 * Build match groups based on cached data
 * Only call AI for unknown pairs
 */
export async function detectSimilarIngredients(
  ingredients: CartItem[],
  previousDecisions?: Map<string, 'merge' | 'keep_separate'>
): Promise<MergeDetectionResult> {
  console.log(`\n=== DB-First Ingredient Detection Started ===`);
  console.log(`Total ingredients to analyze: ${ingredients.length}`);

  const result: MergeDetectionResult = {
    autoMerged: [],
    suggestedMerges: [],
    noMerge: [],
  };

  const processed = new Set<string>();
  let mergeIdCounter = 0;

  // Step 1: For each ingredient, fetch all known comparisons from DB
  console.log(`\n=== Fetching cached comparisons from DB ===`);

  const ingredientComparisons = new Map<string, Map<string, ComparisonResult>>();

  for (const ingredient of ingredients) {
    const comparisons = await getAllComparisonsFor(ingredient.ingredientName);
    if (comparisons.size > 0) {
      console.log(`  "${ingredient.ingredientName}": found ${comparisons.size} cached comparison(s)`);
      ingredientComparisons.set(normalizeIngredientName(ingredient.ingredientName), comparisons);
    }
  }

  // Step 2: Build match groups using pre-fetched cache from Step 1
  console.log(`\n=== Building match groups ===`);

  // Map to track which ingredients match with each other
  const matchGroups = new Map<string, Set<string>>(); // normalized name -> set of matching normalized names

  // Track pairs we need to check with AI
  const uncachedPairs: Array<{ ing1: CartItem; ing2: CartItem }> = [];

  for (let i = 0; i < ingredients.length; i++) {
    if (processed.has(ingredients[i].ingredientId)) continue;

    const ing1 = ingredients[i];
    const norm1 = normalizeIngredientName(ing1.ingredientName);

    for (let j = i + 1; j < ingredients.length; j++) {
      if (processed.has(ingredients[j].ingredientId)) continue;

      const ing2 = ingredients[j];
      const norm2 = normalizeIngredientName(ing2.ingredientName);

      // Look up in pre-fetched comparisons (no extra DB query)
      let cached: ComparisonResult | null = null;
      const preloaded1 = ingredientComparisons.get(norm1);
      if (preloaded1) {
        cached = preloaded1.get(norm2) || null;
      }
      if (!cached) {
        const preloaded2 = ingredientComparisons.get(norm2);
        if (preloaded2) {
          cached = preloaded2.get(norm1) || null;
        }
      }

      if (cached) {
        // Use cached result
        if (cached.status === 'same' || cached.status === 'similar') {
          console.log(`  Cached: "${ing1.ingredientName}" + "${ing2.ingredientName}" → ${cached.status.toUpperCase()}`);

          // Add to match groups
          if (!matchGroups.has(norm1)) {
            matchGroups.set(norm1, new Set([norm1]));
          }
          matchGroups.get(norm1)!.add(norm2);

          if (!matchGroups.has(norm2)) {
            matchGroups.set(norm2, new Set([norm2]));
          }
          matchGroups.get(norm2)!.add(norm1);
        }
      } else {
        // No cache hit - need AI comparison
        uncachedPairs.push({ ing1, ing2 });
      }
    }
  }

  // Step 3: Run AI comparisons in batches for uncached pairs (max 5 concurrent)
  if (uncachedPairs.length > 0) {
    console.log(`\n=== Running ${uncachedPairs.length} AI comparisons (batches of 5) ===`);

    const AI_CONCURRENCY = 5;
    const aiResults: Array<{ ing1: CartItem; ing2: CartItem; comparison: ComparisonResult }> = [];

    for (let i = 0; i < uncachedPairs.length; i += AI_CONCURRENCY) {
      const batch = uncachedPairs.slice(i, i + AI_CONCURRENCY);
      console.log(`  Batch ${Math.floor(i / AI_CONCURRENCY) + 1}: comparing ${batch.length} pairs...`);

      const batchResults = await Promise.all(
        batch.map(async ({ ing1, ing2 }) => {
          const comparison = await compareTwoIngredientsWithAI(
            ing1.ingredientName,
            ing2.ingredientName,
            ing1.unit,
            ing2.unit
          );

          // Cache the result
          await cacheComparison(ing1.ingredientName, ing2.ingredientName, comparison);

          return { ing1, ing2, comparison };
        })
      );

      aiResults.push(...batchResults);
    }

    // Add AI results to match groups
    for (const { ing1, ing2, comparison } of aiResults) {
      if (comparison.status === 'same' || comparison.status === 'similar') {
        const norm1 = normalizeIngredientName(ing1.ingredientName);
        const norm2 = normalizeIngredientName(ing2.ingredientName);

        if (!matchGroups.has(norm1)) {
          matchGroups.set(norm1, new Set([norm1]));
        }
        matchGroups.get(norm1)!.add(norm2);

        if (!matchGroups.has(norm2)) {
          matchGroups.set(norm2, new Set([norm2]));
        }
        matchGroups.get(norm2)!.add(norm1);
      }
    }
  }

  // Step 4: Convert match groups to merge suggestions
  console.log(`\n=== Converting match groups to merge suggestions ===`);

  // Consolidate match groups (transitive closure)
  const consolidatedGroups: Set<string>[] = [];
  const assignedToGroup = new Set<string>();

  for (const [baseIngredient, matches] of matchGroups.entries()) {
    if (assignedToGroup.has(baseIngredient)) continue;

    // Build transitive group
    const group = new Set<string>([baseIngredient]);
    const toProcess = Array.from(matches);

    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      if (group.has(current)) continue;

      group.add(current);
      const currentMatches = matchGroups.get(current);
      if (currentMatches) {
        for (const match of currentMatches) {
          if (!group.has(match)) {
            toProcess.push(match);
          }
        }
      }
    }

    consolidatedGroups.push(group);
    group.forEach(ing => assignedToGroup.add(ing));
  }

  console.log(`  Found ${consolidatedGroups.length} consolidated group(s)`);

  // Step 5: Build PotentialMerge objects from consolidated groups
  for (const group of consolidatedGroups) {
    const groupIngredients = ingredients.filter(ing =>
      group.has(normalizeIngredientName(ing.ingredientName))
    );

    if (groupIngredients.length < 2) continue; // Skip singles

    groupIngredients.forEach(item => processed.add(item.ingredientId));

    // Check cached comparison for status (same vs similar)
    const firstTwo = Array.from(groupIngredients).slice(0, 2);
    const cached = await getCachedComparison(firstTwo[0].ingredientName, firstTwo[1].ingredientName);
    const status = cached?.status || 'similar';

    if (status === 'same') {
      // Auto-merge
      const merged = mergeIngredients(groupIngredients);
      result.autoMerged.push(merged);
      console.log(`  Auto-merged ${groupIngredients.length} ingredients: ${groupIngredients.map(g => g.ingredientName).join(', ')}`);
    } else {
      // Suggest merge to user
      const mergeId = `merge-${++mergeIdCounter}`;
      const suggestedName = getCanonicalName(groupIngredients.map(g => g.ingredientName));
      const units = groupIngredients.map(g => g.unit);

      // Try to get conversion ratios from cache
      let conversionRatios: number[] | undefined;
      let canonicalUnit: string | undefined;
      let totalAmount = 0;

      if (cached?.canonicalUnit && cached.conversionRatio1 && cached.conversionRatio2) {
        canonicalUnit = cached.canonicalUnit;
        // Build conversion ratios array for all ingredients
        conversionRatios = groupIngredients.map((_, idx) => {
          if (idx === 0) return cached.conversionRatio1!;
          if (idx === 1) return cached.conversionRatio2!;
          return 1.0; // Fallback for additional ingredients
        });

        totalAmount = groupIngredients.reduce((sum, item, idx) => {
          return sum + (item.amount * (conversionRatios![idx] || 1.0));
        }, 0);
      } else {
        // Fallback to simple unit conversion
        const commonUnit = findCommonUnit(suggestedName, units[0], units[1] || units[0]);
        if (commonUnit && units.some(u => u !== commonUnit)) {
          canonicalUnit = commonUnit;
          conversionRatios = groupIngredients.map(item => {
            if (item.unit === commonUnit) return 1.0;
            const converted = convertIngredientAmount(suggestedName, 1, item.unit, commonUnit);
            return converted ? converted.amount : 1.0;
          });
          totalAmount = groupIngredients.reduce((sum, item, idx) => {
            return sum + (item.amount * (conversionRatios![idx] || 1.0));
          }, 0);
        } else {
          canonicalUnit = groupIngredients[0].unit;
          totalAmount = groupIngredients.reduce((sum, item) => sum + item.amount, 0);
        }
      }

      result.suggestedMerges.push({
        mergeId,
        ingredients: groupIngredients,
        similarity: 0.80, // Placeholder similarity score
        reason: 'AI-verified match',
        suggestedName,
        totalAmount,
        unit: canonicalUnit,
        canonicalUnit,
        conversionRatios,
        walmartItemId: groupIngredients.find(g => g.walmartItemId)?.walmartItemId || undefined,
      });

      console.log(`  Suggested merge for ${groupIngredients.length} ingredients: ${groupIngredients.map(g => g.ingredientName).join(', ')}`);
    }
  }

  // Step 6: Add unprocessed ingredients to noMerge
  for (const ingredient of ingredients) {
    if (!processed.has(ingredient.ingredientId)) {
      result.noMerge.push(ingredient);
    }
  }

  console.log(`\n=== DB-First Detection Complete ===`);
  console.log(`Auto-merged: ${result.autoMerged.length} groups`);
  console.log(`Suggested merges: ${result.suggestedMerges.length} groups`);
  console.log(`No merge needed: ${result.noMerge.length} items`);

  return result;
}

export function mergeIngredients(items: CartItem[]): CartItem {
  if (items.length === 0) {
    throw new Error('Cannot merge empty array of ingredients');
  }

  if (items.length === 1) {
    return items[0];
  }

  const mergedName = getCanonicalName(items.map(i => i.ingredientName));
  const selectedItem = items.find(i => i.ingredientName === mergedName);
  const commonUnit = selectedItem ? selectedItem.unit : items[0].unit;

  let totalAmount = 0;

  for (const item of items) {
    if (item.unit === commonUnit) {
      totalAmount += item.amount;
    } else {
      const converted = convertIngredientAmount(mergedName, item.amount, item.unit, commonUnit);
      if (converted) {
        totalAmount += converted.amount;
      } else {
        console.warn(`Cannot convert "${item.unit}" to "${commonUnit}" for ingredient "${mergedName}". Using simple addition.`);
        totalAmount += item.amount;
      }
    }
  }

  const allRecipes = [...new Set(items.flatMap(item => item.recipes))];

  const allRecipeBreakdowns: RecipeBreakdown[] = [];
  for (const item of items) {
    if (item.recipeBreakdown && item.recipeBreakdown.length > 0) {
      allRecipeBreakdowns.push(...item.recipeBreakdown);
    }
  }

  const merged: CartItem = {
    ...items[0],
    ingredientName: mergedName,
    amount: totalAmount,
    unit: commonUnit || items[0].unit,
    recipes: allRecipes,
    recipeBreakdown: allRecipeBreakdowns.length > 0 ? allRecipeBreakdowns : undefined,
  };

  const itemWithWalmart = items.find(i => i.walmartItemId);
  if (itemWithWalmart) {
    merged.walmartItemId = itemWithWalmart.walmartItemId;
    merged.walmartSearchTerm = itemWithWalmart.walmartSearchTerm;
  }

  return merged;
}

export function applyMergeDecisions(
  suggestedMerges: PotentialMerge[],
  decisions: Map<string, boolean>
): CartItem[] {
  const result: CartItem[] = [];

  for (const merge of suggestedMerges) {
    const shouldMerge = decisions.get(merge.mergeId);

    if (shouldMerge === true) {
      const merged = mergeIngredients(merge.ingredients);
      result.push(merged);
    } else {
      result.push(...merge.ingredients);
    }
  }

  return result;
}

/**
 * Apply merge decisions by ingredient IDs
 * Used when you have a list of CartItems and need to merge specific ones by their IDs
 */
export function applyMergeDecisionsByIds(
  items: CartItem[],
  mergeDecisions: Array<{ ingredientIds: string[]; decision: 'merge' | 'keep_separate' }>
): CartItem[] {
  const result: CartItem[] = [];
  const processed = new Set<string>();

  for (const decision of mergeDecisions) {
    if (decision.decision === 'merge') {
      const itemsToMerge = items.filter(item => decision.ingredientIds.includes(item.ingredientId));
      if (itemsToMerge.length > 0) {
        const merged = mergeIngredients(itemsToMerge);
        result.push(merged);
        itemsToMerge.forEach(item => processed.add(item.ingredientId));
      }
    } else {
      // keep_separate - add them individually
      const itemsToKeep = items.filter(item => decision.ingredientIds.includes(item.ingredientId));
      result.push(...itemsToKeep);
      itemsToKeep.forEach(item => processed.add(item.ingredientId));
    }
  }

  // Add any items that weren't part of any decision
  const unprocessedItems = items.filter(item => !processed.has(item.ingredientId));
  result.push(...unprocessedItems);

  return result;
}
