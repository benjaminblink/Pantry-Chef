// Ingredient Substitution Service
// Handles ingredient substitutions and quality tier classification

import { prisma } from '../index.js';

export interface SubstituteOption {
  id: string;
  name: string;
  conversionRatio: number;
  qualityImpact: string;
  notes?: string;
  cuisineContext?: string;
  popularity: number;
}

export interface QualityTier {
  tier: 'budget' | 'standard' | 'premium' | 'organic';
  tierLevel: number;
  products: any[];
  avgPrice: number;
  priceRange: { min: number; max: number };
}

/**
 * Find all available substitutes for an ingredient
 */
export async function findSubstitutes(
  ingredientId: string,
  options?: { cuisineContext?: string }
): Promise<SubstituteOption[]> {
  const substitutions = await prisma.ingredientSubstitution.findMany({
    where: {
      primaryIngredientId: ingredientId,
      ...(options?.cuisineContext && {
        OR: [
          { cuisineContext: options.cuisineContext },
          { cuisineContext: null },
        ],
      }),
    },
    include: {
      substituteIngredient: true,
    },
    orderBy: [
      { popularity: 'desc' },
      { qualityImpact: 'asc' },
    ],
  });

  return substitutions.map((sub) => ({
    id: sub.substituteIngredient.id,
    name: sub.substituteIngredient.name,
    conversionRatio: sub.conversionRatio,
    qualityImpact: sub.qualityImpact,
    notes: sub.notes || undefined,
    cuisineContext: sub.cuisineContext || undefined,
    popularity: sub.popularity,
  }));
}

/**
 * Classify Walmart products into quality tiers based on price
 */
export function classifyProductsByTier(products: any[]): QualityTier[] {
  if (!products || products.length === 0) {
    return [];
  }

  const productsWithPrices = products.filter((p) => p.salePrice != null);

  if (productsWithPrices.length === 0) {
    return [];
  }

  const tiers: { [key: string]: any[] } = {
    organic: [],
    premium: [],
    standard: [],
    budget: [],
  };

  const nonOrganicProducts = [];
  for (const product of productsWithPrices) {
    const isOrganic = product.name?.toLowerCase().includes('organic') || false;
    if (isOrganic) {
      tiers.organic.push(product);
    } else {
      nonOrganicProducts.push(product);
    }
  }

  nonOrganicProducts.sort((a, b) => a.salePrice - b.salePrice);

  const count = nonOrganicProducts.length;
  if (count === 0) {
    // All products are organic
  } else if (count <= 5) {
    const budgetCount = Math.max(1, Math.floor(count * 0.4));
    tiers.budget = nonOrganicProducts.slice(0, budgetCount);
    tiers.standard = nonOrganicProducts.slice(budgetCount);
  } else {
    const budgetCount = Math.max(1, Math.ceil(count * 0.2));
    const premiumCount = Math.max(2, Math.ceil(count * 0.2));

    tiers.budget = nonOrganicProducts.slice(0, budgetCount);
    tiers.premium = nonOrganicProducts.slice(count - premiumCount);
    tiers.standard = nonOrganicProducts.slice(budgetCount, count - premiumCount);
  }

  const result: QualityTier[] = [];

  const tierLevels: { [key: string]: number } = {
    budget: 1,
    standard: 2,
    premium: 3,
    organic: 4,
  };

  console.log(`[classifyProductsByTier] Total products with prices: ${productsWithPrices.length}`);
  console.log(`[classifyProductsByTier] Tier distribution:`);
  console.log(`  - Budget (cheapest 20%): ${tiers.budget.length} products`);
  console.log(`  - Standard (middle 60%): ${tiers.standard.length} products`);
  console.log(`  - Premium (top 20%, min 2): ${tiers.premium.length} products`);
  console.log(`  - Organic (contains "organic"): ${tiers.organic.length} products`);

  for (const [tierName, tierProducts] of Object.entries(tiers)) {
    if (tierProducts.length === 0) continue;

    const tierPrices = tierProducts.map((p) => p.salePrice);
    const avgPrice = tierPrices.reduce((a, b) => a + b, 0) / tierPrices.length;
    const minPrice = Math.min(...tierPrices);
    const maxPrice = Math.max(...tierPrices);

    result.push({
      tier: tierName as 'budget' | 'standard' | 'premium' | 'organic',
      tierLevel: tierLevels[tierName],
      products: tierProducts,
      avgPrice,
      priceRange: { min: minPrice, max: maxPrice },
    });
  }

  return result.sort((a, b) => a.tierLevel - b.tierLevel);
}

/**
 * Select best Walmart product from a specific quality tier
 */
export function selectProductByTier(
  products: any[],
  preferredTier?: 'budget' | 'standard' | 'premium' | 'organic',
  options?: {
    maxPrice?: number;
    preferInStock?: boolean;
  }
): any | null {
  if (!products || products.length === 0) {
    return null;
  }

  const tiers = classifyProductsByTier(products);

  if (tiers.length === 0) {
    return null;
  }

  let selectedTier = tiers.find((t) => t.tier === preferredTier);

  if (!selectedTier) {
    selectedTier = tiers.find((t) => t.tier === 'standard') || tiers[0];
  }

  let candidates = selectedTier.products;

  if (options?.maxPrice) {
    candidates = candidates.filter((p) => p.salePrice <= options.maxPrice!);
  }

  if (options?.preferInStock) {
    const inStock = candidates.filter((p) => p.availableOnline === true);
    if (inStock.length > 0) {
      candidates = inStock;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const ratingA = parseFloat(a.customerRating || '0');
    const ratingB = parseFloat(b.customerRating || '0');
    return ratingB - ratingA;
  });

  return candidates[0];
}
