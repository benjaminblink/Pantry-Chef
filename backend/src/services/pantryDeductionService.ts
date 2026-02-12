import { prisma } from '../index.js';
import type { Recipe, UserInventory, Ingredient } from '@prisma/client';

interface DeductionResult {
  ingredientId: string;
  ingredientName: string;
  amountDeducted: number;
  unit: string;
  remainingAmount: number;
}

/**
 * Deduct ingredients from user's pantry after completing meals
 * Matches recipe ingredients against pantry using simple name matching
 * Applies unit conversions where possible
 */
export async function deductPantryIngredients(
  userId: string,
  recipes: (Recipe & { recipeIngredients: Array<{ ingredientId: string; amount: number; unit: string; ingredient: Ingredient }> })[]
): Promise<DeductionResult[]> {
  const results: DeductionResult[] = [];

  // 1. Get user's pantry
  const inventory = await prisma.userInventory.findMany({
    where: { userId, isAvailable: true },
    include: { ingredient: true }
  });

  if (inventory.length === 0) {
    return results; // No pantry items to deduct
  }

  // 2. Aggregate all recipe ingredients (combine duplicates)
  const neededIngredients = aggregateRecipeIngredients(recipes);

  // 3. Match and deduct each needed ingredient
  for (const needed of neededIngredients) {
    const pantryItem = findMatchingPantryItem(needed.ingredientId, inventory);

    if (!pantryItem) {
      continue; // Ingredient not in pantry, skip
    }

    // 4. Calculate deduction
    const deduction = calculateDeduction(needed, pantryItem);

    if (deduction.amountDeducted === 0) {
      continue; // No deduction possible (incompatible units, etc.)
    }

    // 5. Update pantry item
    const newAmount = subtractAmounts(
      parseFloat(pantryItem.amount),
      deduction.amountDeducted,
      pantryItem.unit || ''
    );

    if (newAmount <= 0) {
      // Remove item or mark unavailable
      await prisma.userInventory.update({
        where: { id: pantryItem.id },
        data: { isAvailable: false }
      });
    } else {
      // Update amount
      await prisma.userInventory.update({
        where: { id: pantryItem.id },
        data: { amount: newAmount.toString() }
      });
    }

    results.push({
      ingredientId: pantryItem.ingredientId,
      ingredientName: pantryItem.ingredient.name,
      amountDeducted: deduction.amountDeducted,
      unit: deduction.unit,
      remainingAmount: Math.max(0, newAmount)
    });
  }

  return results;
}

/**
 * Aggregate recipe ingredients (combine duplicates)
 */
function aggregateRecipeIngredients(
  recipes: Array<{ recipeIngredients: Array<{ ingredientId: string; amount: number; unit: string; ingredient: Ingredient }> }>
): Array<{ ingredientId: string; amount: number; unit: string; name: string }> {
  const ingredientMap = new Map<string, { ingredientId: string; amount: number; unit: string; name: string }>();

  for (const recipe of recipes) {
    for (const ri of recipe.recipeIngredients) {
      const existing = ingredientMap.get(ri.ingredientId);

      if (existing) {
        // Same ingredient, same unit → add amounts
        if (existing.unit === ri.unit) {
          existing.amount += ri.amount;
        } else {
          // Different units → keep first occurrence (simplified logic)
          // In production, would convert units here
          existing.amount += ri.amount;
        }
      } else {
        ingredientMap.set(ri.ingredientId, {
          ingredientId: ri.ingredientId,
          amount: ri.amount,
          unit: ri.unit,
          name: ri.ingredient.name
        });
      }
    }
  }

  return Array.from(ingredientMap.values());
}

/**
 * Find matching pantry item by ingredient ID
 */
function findMatchingPantryItem(
  ingredientId: string,
  inventory: Array<UserInventory & { ingredient: Ingredient }>
): (UserInventory & { ingredient: Ingredient }) | undefined {
  return inventory.find(item => item.ingredientId === ingredientId);
}

/**
 * Calculate how much to deduct from pantry
 * Simplified version: deducts the recipe amount if units match
 * In production, would use full unit conversion service
 */
function calculateDeduction(
  needed: { amount: number; unit: string },
  pantryItem: UserInventory & { ingredient: Ingredient }
): { amountDeducted: number; unit: string } {
  const pantryAmount = parseFloat(pantryItem.amount);
  const pantryUnit = pantryItem.unit || '';

  // Simple case: units match
  if (normalizeUnit(needed.unit) === normalizeUnit(pantryUnit)) {
    const amountToDeduct = Math.min(needed.amount, pantryAmount);
    return {
      amountDeducted: amountToDeduct,
      unit: pantryUnit
    };
  }

  // Units don't match → try basic conversions
  const conversion = tryBasicConversion(needed.amount, needed.unit, pantryUnit);

  if (conversion) {
    const amountToDeduct = Math.min(conversion.amount, pantryAmount);
    return {
      amountDeducted: amountToDeduct,
      unit: pantryUnit
    };
  }

  // Can't convert → no deduction
  return {
    amountDeducted: 0,
    unit: pantryUnit
  };
}

/**
 * Subtract amounts (simple numeric subtraction)
 */
function subtractAmounts(pantryAmount: number, deductAmount: number, unit: string): number {
  return Math.max(0, pantryAmount - deductAmount);
}

/**
 * Normalize unit names for comparison
 */
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();

  // Handle common variations
  const unitMap: Record<string, string> = {
    'cup': 'cup',
    'cups': 'cup',
    'c': 'cup',
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'tbsp': 'tbsp',
    'tbs': 'tbsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
    'tsp': 'tsp',
    'pound': 'lb',
    'pounds': 'lb',
    'lb': 'lb',
    'lbs': 'lb',
    'ounce': 'oz',
    'ounces': 'oz',
    'oz': 'oz',
    'gram': 'g',
    'grams': 'g',
    'g': 'g',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'kg': 'kg',
    'milliliter': 'ml',
    'milliliters': 'ml',
    'ml': 'ml',
    'liter': 'l',
    'liters': 'l',
    'l': 'l',
    'piece': 'piece',
    'pieces': 'piece',
    'whole': 'whole',
    'clove': 'clove',
    'cloves': 'clove'
  };

  return unitMap[normalized] || normalized;
}

/**
 * Try basic unit conversions (simplified)
 * In production, would use full unitConversionService.ts
 */
function tryBasicConversion(
  amount: number,
  fromUnit: string,
  toUnit: string
): { amount: number } | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  // Basic conversion table (very simplified)
  const conversions: Record<string, Record<string, number>> = {
    'cup': { 'tbsp': 16, 'tsp': 48, 'ml': 240 },
    'tbsp': { 'tsp': 3, 'ml': 15, 'cup': 1/16 },
    'tsp': { 'ml': 5, 'tbsp': 1/3, 'cup': 1/48 },
    'lb': { 'oz': 16, 'g': 453.592, 'kg': 0.453592 },
    'oz': { 'g': 28.3495, 'lb': 1/16 },
    'g': { 'kg': 0.001, 'oz': 0.035274, 'lb': 0.00220462 },
    'kg': { 'g': 1000, 'lb': 2.20462 },
    'ml': { 'l': 0.001, 'cup': 1/240, 'tbsp': 1/15, 'tsp': 1/5 },
    'l': { 'ml': 1000 }
  };

  if (conversions[from]?.[to]) {
    return { amount: amount * conversions[from][to] };
  }

  return null;
}
