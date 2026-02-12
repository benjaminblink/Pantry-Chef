/**
 * Ingredient-specific conversions
 * Handles conversions between different forms of the same ingredient
 */

export interface IngredientConversion {
  from: string;
  to: string;
  ratio: number;
  ingredientPatterns: string[];
}

const CONVERSIONS: IngredientConversion[] = [
  {
    from: 'whole',
    to: 'cup',
    ratio: 0.25,
    ingredientPatterns: ['lemon juice', 'lemon', 'fresh lemon']
  },
  {
    from: 'whole',
    to: 'oz',
    ratio: 2,
    ingredientPatterns: ['lemon juice', 'lemon', 'fresh lemon']
  },
  {
    from: 'whole',
    to: 'tbsp',
    ratio: 4,
    ingredientPatterns: ['lemon juice', 'lemon', 'fresh lemon']
  },
  {
    from: 'whole',
    to: 'cup',
    ratio: 0.125,
    ingredientPatterns: ['lime juice', 'lime', 'fresh lime']
  },
  {
    from: 'whole',
    to: 'oz',
    ratio: 1,
    ingredientPatterns: ['lime juice', 'lime', 'fresh lime']
  },
  {
    from: 'whole',
    to: 'tbsp',
    ratio: 2,
    ingredientPatterns: ['lime juice', 'lime', 'fresh lime']
  },
  {
    from: 'whole',
    to: 'cup',
    ratio: 0.5,
    ingredientPatterns: ['orange juice', 'orange', 'fresh orange']
  },
  {
    from: 'whole',
    to: 'cup',
    ratio: 1,
    ingredientPatterns: ['onion', 'yellow onion', 'white onion', 'red onion', 'diced onion', 'chopped onion']
  },
  {
    from: 'clove',
    to: 'tsp',
    ratio: 0.5,
    ingredientPatterns: ['garlic', 'minced garlic', 'fresh garlic']
  },
  {
    from: 'clove',
    to: 'tbsp',
    ratio: 0.167,
    ingredientPatterns: ['garlic', 'minced garlic', 'fresh garlic']
  },
  {
    from: 'whole',
    to: 'cup',
    ratio: 0.75,
    ingredientPatterns: ['tomato', 'diced tomato', 'chopped tomato']
  },
  {
    from: 'whole',
    to: 'cup',
    ratio: 1,
    ingredientPatterns: ['bell pepper', 'red pepper', 'green pepper', 'yellow pepper', 'pepper']
  },
  {
    from: 'whole',
    to: 'cup',
    ratio: 1,
    ingredientPatterns: ['avocado', 'mashed avocado']
  },
];

/**
 * Check if an ingredient name matches a pattern
 */
function matchesPattern(ingredientName: string, patterns: string[]): boolean {
  const lower = ingredientName.toLowerCase().trim();
  return patterns.some(pattern => {
    const patternLower = pattern.toLowerCase();
    return lower.includes(patternLower) || patternLower.includes(lower);
  });
}

/**
 * Normalize unit names for comparison
 */
function normalizeUnitForComparison(unit: string): string {
  return unit.toLowerCase()
    .trim()
    .replace(/s$/, '')
    .replace(/\./g, '');
}

/**
 * Find a conversion between two units for a given ingredient
 */
export function findConversion(
  ingredientName: string,
  fromUnit: string,
  toUnit: string
): { ratio: number; direction: 'forward' | 'reverse' } | null {
  const normalizedFrom = normalizeUnitForComparison(fromUnit);
  const normalizedTo = normalizeUnitForComparison(toUnit);

  for (const conv of CONVERSIONS) {
    if (!matchesPattern(ingredientName, conv.ingredientPatterns)) {
      continue;
    }

    const convFrom = normalizeUnitForComparison(conv.from);
    const convTo = normalizeUnitForComparison(conv.to);

    if (normalizedFrom === convFrom && normalizedTo === convTo) {
      return { ratio: conv.ratio, direction: 'forward' };
    }

    if (normalizedFrom === convTo && normalizedTo === convFrom) {
      return { ratio: 1 / conv.ratio, direction: 'reverse' };
    }
  }

  return null;
}

/**
 * Convert an amount from one unit to another for a specific ingredient
 */
export function convertIngredientAmount(
  ingredientName: string,
  amount: number,
  fromUnit: string,
  toUnit: string
): { amount: number; unit: string } | null {
  const conversion = findConversion(ingredientName, fromUnit, toUnit);

  if (!conversion) {
    return null;
  }

  return {
    amount: amount * conversion.ratio,
    unit: toUnit
  };
}

/**
 * Try to find a common unit between two units for merging
 */
export function findCommonUnit(
  ingredientName: string,
  unit1: string,
  unit2: string
): string | null {
  const norm1 = normalizeUnitForComparison(unit1);
  const norm2 = normalizeUnitForComparison(unit2);

  if (norm1 === norm2) {
    return unit1;
  }

  const toCups1 = findConversion(ingredientName, unit1, 'cup');
  const toCups2 = findConversion(ingredientName, unit2, 'cup');

  if (toCups1 && toCups2) {
    return 'cup';
  }

  const toOz1 = findConversion(ingredientName, unit1, 'oz');
  const toOz2 = findConversion(ingredientName, unit2, 'oz');

  if (toOz1 && toOz2) {
    return 'oz';
  }

  if (findConversion(ingredientName, unit1, unit2)) {
    return unit2;
  }

  if (findConversion(ingredientName, unit2, unit1)) {
    return unit1;
  }

  return null;
}
