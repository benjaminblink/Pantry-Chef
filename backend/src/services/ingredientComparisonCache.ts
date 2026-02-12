/**
 * Ingredient Comparison Cache Service
 * Manages caching of AI-determined ingredient comparisons to reduce API costs
 */

import { prisma } from '../index.js';

export interface ComparisonResult {
  status: 'same' | 'similar' | 'different';
  conversionRatio1?: number;
  conversionRatio2?: number;
  canonicalUnit?: string;
}

/**
 * Normalize ingredient name for consistent cache lookups
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 */
export function normalizeIngredientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Get a sorted pair of ingredient names for cache key
 * Always returns [smaller, larger] alphabetically to ensure consistent lookups
 */
function getSortedPair(ingredient1: string, ingredient2: string): [string, string] {
  const norm1 = normalizeIngredientName(ingredient1);
  const norm2 = normalizeIngredientName(ingredient2);
  return norm1 < norm2 ? [norm1, norm2] : [norm2, norm1];
}

/**
 * Look up a cached comparison between two ingredients
 * Returns null if not found in cache
 */
export async function getCachedComparison(
  ingredient1: string,
  ingredient2: string
): Promise<ComparisonResult | null> {
  const [norm1, norm2] = getSortedPair(ingredient1, ingredient2);

  const cached = await prisma.ingredientComparison.findUnique({
    where: {
      ingredient1_ingredient2: {
        ingredient1: norm1,
        ingredient2: norm2,
      },
    },
  });

  if (!cached) {
    return null;
  }

  return {
    status: cached.status as 'same' | 'similar' | 'different',
    conversionRatio1: cached.conversionRatio1 ?? undefined,
    conversionRatio2: cached.conversionRatio2 ?? undefined,
    canonicalUnit: cached.canonicalUnit ?? undefined,
  };
}

/**
 * Store a new comparison result in the cache
 */
export async function cacheComparison(
  ingredient1: string,
  ingredient2: string,
  result: ComparisonResult
): Promise<void> {
  const [norm1, norm2] = getSortedPair(ingredient1, ingredient2);

  await prisma.ingredientComparison.upsert({
    where: {
      ingredient1_ingredient2: {
        ingredient1: norm1,
        ingredient2: norm2,
      },
    },
    create: {
      ingredient1: norm1,
      ingredient2: norm2,
      status: result.status,
      conversionRatio1: result.conversionRatio1 ?? null,
      conversionRatio2: result.conversionRatio2 ?? null,
      canonicalUnit: result.canonicalUnit ?? null,
    },
    update: {
      status: result.status,
      conversionRatio1: result.conversionRatio1 ?? null,
      conversionRatio2: result.conversionRatio2 ?? null,
      canonicalUnit: result.canonicalUnit ?? null,
    },
  });
}

/**
 * Find all known comparisons for a given ingredient
 * Returns a map of ingredient name -> comparison result
 */
export async function getAllComparisonsFor(
  ingredientName: string
): Promise<Map<string, ComparisonResult>> {
  const normalized = normalizeIngredientName(ingredientName);

  const comparisons = await prisma.ingredientComparison.findMany({
    where: {
      OR: [
        { ingredient1: normalized },
        { ingredient2: normalized },
      ],
    },
  });

  const results = new Map<string, ComparisonResult>();

  for (const comp of comparisons) {
    // Determine which is the "other" ingredient
    const otherIngredient = comp.ingredient1 === normalized ? comp.ingredient2 : comp.ingredient1;

    results.set(otherIngredient, {
      status: comp.status as 'same' | 'similar' | 'different',
      conversionRatio1: comp.conversionRatio1 ?? undefined,
      conversionRatio2: comp.conversionRatio2 ?? undefined,
      canonicalUnit: comp.canonicalUnit ?? undefined,
    });
  }

  return results;
}

/**
 * Batch lookup of comparisons for multiple ingredient pairs
 * Returns a map of "ingredient1|ingredient2" -> comparison result
 */
export async function batchGetCachedComparisons(
  pairs: Array<[string, string]>
): Promise<Map<string, ComparisonResult>> {
  if (pairs.length === 0) {
    return new Map();
  }

  // Build OR conditions for all pairs
  const orConditions = pairs.map(([ing1, ing2]) => {
    const [norm1, norm2] = getSortedPair(ing1, ing2);
    return {
      ingredient1: norm1,
      ingredient2: norm2,
    };
  });

  const comparisons = await prisma.ingredientComparison.findMany({
    where: {
      OR: orConditions,
    },
  });

  const results = new Map<string, ComparisonResult>();

  for (const comp of comparisons) {
    // Create cache key
    const cacheKey = `${comp.ingredient1}|${comp.ingredient2}`;

    results.set(cacheKey, {
      status: comp.status as 'same' | 'similar' | 'different',
      conversionRatio1: comp.conversionRatio1 ?? undefined,
      conversionRatio2: comp.conversionRatio2 ?? undefined,
      canonicalUnit: comp.canonicalUnit ?? undefined,
    });
  }

  return results;
}
