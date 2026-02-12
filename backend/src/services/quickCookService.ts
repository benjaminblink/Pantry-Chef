import { prisma } from '../index.js';
import { generateRecipesFromParams } from './recipeAgent.js';

interface QuickCookRecipe {
  id: string;
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients: Array<{
    id: string;
    name: string;
    amount: string;
    unit: string;
    inPantry?: boolean;
  }>;
}

/**
 * Suggest recipes based on what's in the user's pantry
 * Uses AI to generate recipes that primarily use available ingredients
 */
export async function suggestRecipesFromPantry(
  userId: string,
  count: number = 3
): Promise<QuickCookRecipe[]> {
  // 1. Fetch user's available inventory
  const inventory = await prisma.userInventory.findMany({
    where: {
      userId,
      isAvailable: true
    },
    include: {
      ingredient: true
    }
  });

  if (inventory.length === 0) {
    throw new Error('Your pantry is empty. Add some ingredients first!');
  }

  // 2. Build ingredient list string for AI prompt
  const ingredientList = inventory.map(item =>
    `${item.ingredient.name} (${item.amount} ${item.unit || 'units'})`
  ).join(', ');

  // 3. Build generation parameters with pantry-focused prompt
  const generationParams = {
    dietaryRestrictions: [],
    customPrompt: `Create recipes that PRIMARILY use these ingredients I already have in my pantry: ${ingredientList}.

You may suggest 1-2 additional common ingredients if absolutely necessary, but the goal is to use what I already have. Minimize grocery shopping.

Each recipe should:
- Use at least 3 ingredients from my pantry
- Be practical and easy to make
- Include clear instructions
- Have accurate nutritional information`
  };

  // 5. Generate recipes using the recipe agent
  const result = await generateRecipesFromParams(
    generationParams,
    'dinner', // mealType (default to dinner for quick cook)
    count,
    userId,
    undefined, // userStyles
    inventory // pass inventory for context
  );

  // 6. Enrich recipes with pantry status for each ingredient
  const enrichedRecipes: QuickCookRecipe[] = [];

  for (const recipeId of result.recipeIds) {
    // Get full recipe with ingredients
    const fullRecipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        recipeIngredients: {
          include: {
            ingredient: true
          }
        }
      }
    });

    if (!fullRecipe) continue;

    // Mark which ingredients are in pantry
    const ingredientsWithPantryStatus = fullRecipe.recipeIngredients.map(ri => {
      const inPantry = inventory.some(
        inv => inv.ingredientId === ri.ingredientId
      );

      return {
        id: ri.ingredientId,
        name: ri.ingredient.name,
        amount: String(ri.amount),
        unit: ri.unit || '',
        inPantry
      };
    });

    enrichedRecipes.push({
      id: fullRecipe.id,
      title: fullRecipe.title,
      description: fullRecipe.description || '',
      prepTime: fullRecipe.prepTime || 0,
      cookTime: fullRecipe.cookTime || 0,
      servings: fullRecipe.servings || 4,
      calories: fullRecipe.calories || undefined,
      protein: fullRecipe.protein || undefined,
      carbs: fullRecipe.carbs || undefined,
      fat: fullRecipe.fat || undefined,
      ingredients: ingredientsWithPantryStatus
    });
  }

  return enrichedRecipes;
}

/**
 * Get pantry coverage statistics for a recipe
 * Returns percentage of ingredients available in pantry
 */
export async function getPantryCoverage(
  userId: string,
  recipeId: string
): Promise<{
  totalIngredients: number;
  availableInPantry: number;
  coveragePercent: number;
  missingIngredients: string[];
}> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      recipeIngredients: {
        include: {
          ingredient: true
        }
      }
    }
  });

  if (!recipe) {
    throw new Error('Recipe not found');
  }

  const inventory = await prisma.userInventory.findMany({
    where: {
      userId,
      isAvailable: true
    }
  });

  const totalIngredients = recipe.recipeIngredients.length;
  let availableInPantry = 0;
  const missingIngredients: string[] = [];

  for (const ri of recipe.recipeIngredients) {
    const inPantry = inventory.some(inv => inv.ingredientId === ri.ingredientId);
    if (inPantry) {
      availableInPantry++;
    } else {
      missingIngredients.push(ri.ingredient.name);
    }
  }

  const coveragePercent = totalIngredients > 0
    ? Math.round((availableInPantry / totalIngredients) * 100)
    : 0;

  return {
    totalIngredients,
    availableInPantry,
    coveragePercent,
    missingIngredients
  };
}
