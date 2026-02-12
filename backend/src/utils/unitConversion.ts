// Unit conversion utilities for ingredient measurements

export type UnitType = 'volume' | 'weight' | 'count';

export interface ConversionResult {
  amount: number;
  unit: string;
  originalAmount: number;
  originalUnit: string;
}

const VOLUME_TO_CUPS: Record<string, number> = {
  'cup': 1,
  'cups': 1,
  'c': 1,
  'tablespoon': 1/16,
  'tablespoons': 1/16,
  'tbsp': 1/16,
  'tbs': 1/16,
  'T': 1/16,
  'teaspoon': 1/48,
  'teaspoons': 1/48,
  'tsp': 1/48,
  't': 1/48,
  'fluid ounce': 1/8,
  'fluid ounces': 1/8,
  'fl oz': 1/8,
  'fl. oz.': 1/8,
  'oz': 1/8,
  'pint': 2,
  'pints': 2,
  'pt': 2,
  'quart': 4,
  'quarts': 4,
  'qt': 4,
  'gallon': 16,
  'gallons': 16,
  'gal': 16,
  'milliliter': 1/236.588,
  'milliliters': 1/236.588,
  'ml': 1/236.588,
  'liter': 4.22675,
  'liters': 4.22675,
  'l': 4.22675,
};

const WEIGHT_TO_POUNDS: Record<string, number> = {
  'pound': 1,
  'pounds': 1,
  'lb': 1,
  'lbs': 1,
  'ounce': 1/16,
  'ounces': 1/16,
  'oz': 1/16,
  'gram': 0.00220462,
  'grams': 0.00220462,
  'g': 0.00220462,
  'kilogram': 2.20462,
  'kilograms': 2.20462,
  'kg': 2.20462,
};

const COUNT_UNITS = [
  'whole', 'piece', 'pieces', 'item', 'items',
  'clove', 'cloves', 'head', 'heads', 'bunch', 'bunches',
  'can', 'cans', 'package', 'packages', 'bag', 'bags',
  'slice', 'slices', 'strip', 'strips',
  'pinch', 'pinches', 'dash', 'dashes',
  'to taste', 'as needed',
  'lemon', 'lemons', 'lime', 'limes', 'orange', 'oranges',
  'apple', 'apples', 'banana', 'bananas', 'onion', 'onions',
  'potato', 'potatoes', 'tomato', 'tomatoes', 'carrot', 'carrots',
  'egg', 'eggs', 'pepper', 'peppers', 'avocado', 'avocados',
];

/**
 * Determine the unit type
 */
export function getUnitType(unit: string): UnitType {
  const normalizedUnit = unit.toLowerCase().trim();

  if (VOLUME_TO_CUPS[normalizedUnit]) return 'volume';
  if (WEIGHT_TO_POUNDS[normalizedUnit]) return 'weight';
  if (COUNT_UNITS.includes(normalizedUnit)) return 'count';

  return 'count';
}

/**
 * Convert a volume measurement to cups
 */
export function convertToCups(amount: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim();
  const conversionFactor = VOLUME_TO_CUPS[normalizedUnit];

  if (!conversionFactor) {
    throw new Error(`Unknown volume unit: ${unit}`);
  }

  return amount * conversionFactor;
}

/**
 * Convert a weight measurement to pounds
 */
export function convertToPounds(amount: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim();
  const conversionFactor = WEIGHT_TO_POUNDS[normalizedUnit];

  if (!conversionFactor) {
    throw new Error(`Unknown weight unit: ${unit}`);
  }

  return amount * conversionFactor;
}

/**
 * Format a decimal amount to a user-friendly fraction/decimal
 */
export function formatAmount(amount: number): string {
  const whole = Math.floor(amount);
  const fraction = amount - whole;

  const fractions: [number, string][] = [
    [1/4, '1/4'],
    [1/3, '1/3'],
    [1/2, '1/2'],
    [2/3, '2/3'],
    [3/4, '3/4'],
  ];

  for (const [value, display] of fractions) {
    if (Math.abs(fraction - value) < 0.01) {
      return whole > 0 ? `${whole} ${display}` : display;
    }
  }

  if (fraction < 0.01) {
    return whole.toString();
  }

  return amount.toFixed(2);
}

/**
 * Get the best display unit for a given amount in cups
 */
export function getBestVolumeUnit(cups: number): { amount: number; unit: string } {
  if (cups < 0.25) {
    const tbsp = cups * 16;
    if (tbsp < 1) {
      return { amount: tbsp * 3, unit: 'tsp' };
    }
    return { amount: tbsp, unit: 'tbsp' };
  }

  if (cups < 2) {
    return { amount: cups, unit: 'cup' };
  }

  if (cups < 4) {
    return { amount: cups, unit: 'cups' };
  }

  if (cups < 8) {
    const quarts = cups / 4;
    return { amount: quarts, unit: quarts === 1 ? 'quart' : 'quarts' };
  }

  const gallons = cups / 16;
  return { amount: gallons, unit: gallons === 1 ? 'gallon' : 'gallons' };
}

/**
 * Get the best display unit for a given amount in pounds
 */
export function getBestWeightUnit(pounds: number): { amount: number; unit: string } {
  if (pounds < 1) {
    const ounces = pounds * 16;
    return { amount: ounces, unit: ounces === 1 ? 'oz' : 'oz' };
  }

  return { amount: pounds, unit: pounds === 1 ? 'lb' : 'lbs' };
}

/**
 * Combine two ingredient amounts with the same unit type
 */
export function combineIngredients(
  amount1: number,
  unit1: string,
  amount2: number,
  unit2: string
): ConversionResult {
  const type1 = getUnitType(unit1);
  const type2 = getUnitType(unit2);

  if (type1 !== type2) {
    throw new Error(`Cannot combine different unit types: ${unit1} (${type1}) and ${unit2} (${type2})`);
  }

  if (type1 === 'count') {
    return {
      amount: amount1 + amount2,
      unit: unit1,
      originalAmount: amount1 + amount2,
      originalUnit: unit1,
    };
  }

  if (type1 === 'volume') {
    const totalCups = convertToCups(amount1, unit1) + convertToCups(amount2, unit2);
    const { amount, unit } = getBestVolumeUnit(totalCups);
    return {
      amount,
      unit,
      originalAmount: totalCups,
      originalUnit: 'cups',
    };
  }

  if (type1 === 'weight') {
    const totalPounds = convertToPounds(amount1, unit1) + convertToPounds(amount2, unit2);
    const { amount, unit } = getBestWeightUnit(totalPounds);
    return {
      amount,
      unit,
      originalAmount: totalPounds,
      originalUnit: 'lbs',
    };
  }

  throw new Error('Unknown unit type');
}

/**
 * Normalize a unit to a standard Walmart-friendly format
 */
export function normalizeUnit(amount: number, unit: string): { amount: number; unit: string } {
  const type = getUnitType(unit);

  if (type === 'count') {
    return { amount, unit };
  }

  if (type === 'volume') {
    const cups = convertToCups(amount, unit);
    return getBestVolumeUnit(cups);
  }

  if (type === 'weight') {
    const pounds = convertToPounds(amount, unit);
    return getBestWeightUnit(pounds);
  }

  return { amount, unit };
}
