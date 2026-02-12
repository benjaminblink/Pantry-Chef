// Unit Conversion Service
// Generic service for converting between units using database-backed conversions

import { prisma } from '../index.js';
import { parseProductSize } from '../utils/productSizeCalculator.js';

interface ConversionResult {
  amount: number;
  unit: string;
  isApproximate: boolean;
  reasoning?: string;
}

interface PurchaseCountResult {
  packageCount: number;
  packageUnit: string;
  packageSize: string;
  reasoning: string;
}

/**
 * Convert an amount from one unit to another using database conversions
 */
export async function convertUnits(
  amount: number,
  fromUnit: string,
  toUnit: string,
  ingredientName?: string
): Promise<ConversionResult | null> {
  const normalizedFrom = normalizeUnitName(fromUnit);
  const normalizedTo = normalizeUnitName(toUnit);

  if (normalizedFrom === normalizedTo) {
    return {
      amount,
      unit: toUnit,
      isApproximate: false,
    };
  }

  if (ingredientName) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { name: { contains: ingredientName, mode: 'insensitive' } },
    });

    if (ingredient) {
      const conversion = await prisma.unitConversion.findFirst({
        where: {
          fromUnit: { abbreviation: { equals: normalizedFrom, mode: 'insensitive' } },
          toUnit: { abbreviation: { equals: normalizedTo, mode: 'insensitive' } },
          ingredientId: ingredient.id,
        },
        include: {
          fromUnit: true,
          toUnit: true,
        },
      });

      if (conversion) {
        const converted = (amount / conversion.fromAmount) * conversion.toAmount;
        return {
          amount: converted,
          unit: conversion.toUnit.abbreviation,
          isApproximate: conversion.isApproximate,
          reasoning: conversion.notes || `Ingredient-specific: ${ingredient.name}`,
        };
      }
    }
  }

  const conversion = await prisma.unitConversion.findFirst({
    where: {
      fromUnit: { abbreviation: { equals: normalizedFrom, mode: 'insensitive' } },
      toUnit: { abbreviation: { equals: normalizedTo, mode: 'insensitive' } },
      ingredientId: null,
    },
    include: {
      fromUnit: true,
      toUnit: true,
    },
  });

  if (!conversion) {
    console.warn(`No conversion found from ${fromUnit} to ${toUnit}`);
    return null;
  }

  const converted = (amount / conversion.fromAmount) * conversion.toAmount;
  return {
    amount: converted,
    unit: conversion.toUnit.abbreviation,
    isApproximate: conversion.isApproximate,
  };
}

/**
 * Calculate how many packages to buy based on recipe needs and Walmart product size
 */
export async function calculatePurchaseCount(
  recipeAmount: number,
  recipeUnit: string,
  walmartSize: string,
  ingredientName?: string
): Promise<PurchaseCountResult> {
  console.log(`\n📊 Calculating purchase count:`);
  console.log(`   Need: ${recipeAmount} ${recipeUnit} of ${ingredientName || 'unknown'}`);
  console.log(`   Walmart size: "${walmartSize}"`);

  const parsedSize = parseProductSize(walmartSize);
  if (!parsedSize) {
    console.warn(`   ⚠️  Could not parse Walmart size: "${walmartSize}"`);
    return {
      packageCount: 1,
      packageUnit: 'count',
      packageSize: walmartSize,
      reasoning: `Could not parse size "${walmartSize}", defaulting to 1 package`,
    };
  }

  const packageAmount = parsedSize.amount;
  const packageUnit = parsedSize.unit;
  console.log(`   Parsed: ${packageAmount} ${packageUnit}`);

  const converted = await convertUnits(recipeAmount, recipeUnit, packageUnit, ingredientName);

  if (!converted) {
    console.warn(`   ⚠️  No conversion from ${recipeUnit} to ${packageUnit}`);
    return {
      packageCount: 1,
      packageUnit: 'count',
      packageSize: walmartSize,
      reasoning: `Cannot convert ${recipeUnit} to ${packageUnit}, defaulting to 1 package`,
    };
  }

  const convertedAmount = converted.amount;
  console.log(`   Converted: ${recipeAmount} ${recipeUnit} = ${convertedAmount.toFixed(2)} ${packageUnit}`);

  const packagesNeeded = convertedAmount / packageAmount;
  const packageCount = Math.ceil(packagesNeeded);

  console.log(`   Calculation: ${convertedAmount.toFixed(2)} / ${packageAmount} = ${packagesNeeded.toFixed(2)}`);
  console.log(`   ✅ Result: Buy ${packageCount} package(s)`);

  return {
    packageCount,
    packageUnit: 'count',
    packageSize: walmartSize,
    reasoning: `${recipeAmount} ${recipeUnit} ≈ ${convertedAmount.toFixed(1)} ${packageUnit}, need ${packageCount}× ${walmartSize} package`,
  };
}

/**
 * Normalize unit name to handle plurals and common variations
 */
function normalizeUnitName(unit: string): string {
  const normalized = unit.toLowerCase().trim();

  const unitMap: Record<string, string> = {
    'ounce': 'oz',
    'ounces': 'oz',
    'pound': 'lb',
    'pounds': 'lb',
    'lbs': 'lb',
    'gram': 'g',
    'grams': 'g',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'cup': 'cup',
    'cups': 'cup',
    'fluid ounce': 'fl oz',
    'fluid ounces': 'fl oz',
    'fl. oz': 'fl oz',
    'floz': 'fl oz',
    'pint': 'pt',
    'pints': 'pt',
    'quart': 'qt',
    'quarts': 'qt',
    'gallon': 'gal',
    'gallons': 'gal',
    'milliliter': 'ml',
    'milliliters': 'ml',
    'liter': 'L',
    'liters': 'L',
    'count': 'count',
    'piece': 'piece',
    'pieces': 'piece',
  };

  return unitMap[normalized] || normalized;
}
