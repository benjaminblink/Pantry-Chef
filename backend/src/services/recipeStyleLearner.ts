// Recipe Style Learner Service
// Analyzes user's recipe history to learn cooking style preferences

import { Recipe, RecipeHistory, UserRecipeStyle, RecipeIngredient, Ingredient } from '@prisma/client';
import { prisma } from '../index.js';
import { categorizeStyle, getKeywordsForStyle } from '../config/preferenceLibrary.js';

interface RecipeStyleAnalysis {
  cookingMethods: string[];
  timingProfiles: string[];
  cuisineStyles: string[];
  complexity: string[];
  dietaryPatterns: string[];
}

type RecipeWithIngredients = Recipe & {
  recipeIngredients: (RecipeIngredient & {
    ingredient: Ingredient;
  })[];
};

/**
 * Analyzes user's recipe history to learn their style preferences
 */
export async function learnUserRecipeStyles(userId: string): Promise<UserRecipeStyle[]> {
  const favoriteRecipes = await prisma.recipeHistory.findMany({
    where: {
      userId,
      OR: [
        { rating: { gte: 4 } },
        { isFavorite: true },
        { didCook: true, wouldMakeAgain: true }
      ]
    },
    include: {
      recipe: {
        include: {
          recipeIngredients: {
            include: { ingredient: true }
          }
        }
      }
    },
    orderBy: { viewedAt: 'desc' },
    take: 50
  });

  const stylePatterns = new Map<string, number>();

  for (const history of favoriteRecipes) {
    const recipe = history.recipe;
    const analysis = analyzeRecipeStyle(recipe);

    [
      ...analysis.cookingMethods,
      ...analysis.timingProfiles,
      ...analysis.cuisineStyles,
      ...analysis.complexity,
      ...analysis.dietaryPatterns
    ].forEach(style => {
      stylePatterns.set(style, (stylePatterns.get(style) || 0) + 1);
    });
  }

  const maxCount = Math.max(...stylePatterns.values(), 1);
  const userStyles: UserRecipeStyle[] = [];

  for (const [styleName, count] of stylePatterns.entries()) {
    const affinity = count / maxCount;

    if (affinity > 0.2) {
      let style = await prisma.recipeStyle.findUnique({
        where: { name: styleName }
      });

      if (!style) {
        style = await prisma.recipeStyle.create({
          data: {
            name: styleName,
            category: categorizeStyle(styleName),
            keywords: getKeywordsForStyle(styleName)
          }
        });
      }

      const userStyle = await prisma.userRecipeStyle.upsert({
        where: {
          userId_styleId: { userId, styleId: style.id }
        },
        update: {
          affinity,
          recipesCooked: count
        },
        create: {
          userId,
          styleId: style.id,
          affinity,
          recipesCooked: count
        },
        include: {
          style: true
        }
      });

      userStyles.push(userStyle);
    }
  }

  return userStyles;
}

/**
 * Analyzes a single recipe to extract style characteristics
 */
export function analyzeRecipeStyle(recipe: RecipeWithIngredients): RecipeStyleAnalysis {
  const analysis: RecipeStyleAnalysis = {
    cookingMethods: [],
    timingProfiles: [],
    cuisineStyles: [],
    complexity: [],
    dietaryPatterns: []
  };

  const title = (recipe.title || '').toLowerCase();
  const description = (recipe.description || '').toLowerCase();
  const instructions = JSON.stringify(recipe.instructions).toLowerCase();
  const allText = `${title} ${description} ${instructions}`;

  if (allText.includes('one pot') || allText.includes('one-pot')) {
    analysis.cookingMethods.push('one-pot');
  }
  if (allText.includes('sheet pan') || allText.includes('sheet-pan')) {
    analysis.cookingMethods.push('sheet-pan');
  }
  if (allText.includes('slow cooker') || allText.includes('crockpot')) {
    analysis.cookingMethods.push('slow-cooker');
  }
  if (allText.includes('grill') || allText.includes('bbq')) {
    analysis.cookingMethods.push('grilled');
  }
  if (allText.includes('bake') || allText.includes('oven')) {
    analysis.cookingMethods.push('baked');
  }
  if (allText.includes('stir fry') || allText.includes('stir-fry')) {
    analysis.cookingMethods.push('stir-fry');
  }

  const totalTime = recipe.prepTime + recipe.cookTime;
  if (totalTime <= 30) {
    analysis.timingProfiles.push('quick-weeknight');
  } else if (totalTime <= 60) {
    analysis.timingProfiles.push('moderate-time');
  } else {
    analysis.timingProfiles.push('weekend-project');
  }

  const cuisineKeywords: Record<string, string[]> = {
    'mediterranean': ['mediterranean', 'greek', 'olive oil', 'feta'],
    'asian': ['asian', 'soy sauce', 'ginger', 'sesame'],
    'mexican': ['mexican', 'taco', 'salsa', 'tortilla', 'cilantro'],
    'italian': ['italian', 'pasta', 'parmesan', 'basil'],
    'american-comfort': ['comfort', 'mac and cheese', 'meatloaf', 'casserole'],
    'indian': ['indian', 'curry', 'turmeric', 'cumin', 'garam masala']
  };

  for (const [cuisine, keywords] of Object.entries(cuisineKeywords)) {
    if (keywords.some(kw => allText.includes(kw))) {
      analysis.cuisineStyles.push(cuisine);
    }
  }

  const instructionSteps = Array.isArray(recipe.instructions) ? recipe.instructions.length : 0;
  if (instructionSteps <= 5) {
    analysis.complexity.push('simple');
  } else if (instructionSteps <= 10) {
    analysis.complexity.push('moderate');
  } else {
    analysis.complexity.push('complex');
  }

  if (recipe.protein && recipe.protein > 30) {
    analysis.dietaryPatterns.push('high-protein');
  }
  if (recipe.carbs && recipe.carbs < 20) {
    analysis.dietaryPatterns.push('low-carb');
  }
  if (recipe.calories && recipe.calories < 400) {
    analysis.dietaryPatterns.push('light');
  }
  if (recipe.calories && recipe.calories > 700) {
    analysis.dietaryPatterns.push('hearty');
  }

  return analysis;
}

/**
 * Get user's top recipe styles
 */
export async function getUserTopStyles(
  userId: string,
  limit: number = 5
): Promise<UserRecipeStyle[]> {
  return prisma.userRecipeStyle.findMany({
    where: {
      userId,
      isActive: true
    },
    include: {
      style: true
    },
    orderBy: {
      affinity: 'desc'
    },
    take: limit
  });
}

/**
 * Update user styles based on new recipe interaction
 */
export async function updateStyleFromRecipe(
  userId: string,
  recipeId: string,
  didLike: boolean
): Promise<void> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      recipeIngredients: {
        include: { ingredient: true }
      }
    }
  });

  if (!recipe) return;

  const analysis = analyzeRecipeStyle(recipe);
  const allStyles = [
    ...analysis.cookingMethods,
    ...analysis.timingProfiles,
    ...analysis.cuisineStyles,
    ...analysis.complexity,
    ...analysis.dietaryPatterns
  ];

  for (const styleName of allStyles) {
    let style = await prisma.recipeStyle.findUnique({
      where: { name: styleName }
    });

    if (!style) {
      style = await prisma.recipeStyle.create({
        data: {
          name: styleName,
          category: categorizeStyle(styleName),
          keywords: getKeywordsForStyle(styleName)
        }
      });
    }

    const existing = await prisma.userRecipeStyle.findUnique({
      where: {
        userId_styleId: { userId, styleId: style.id }
      }
    });

    if (existing) {
      const adjustment = didLike ? 0.05 : -0.05;
      const newAffinity = Math.max(0, Math.min(1, existing.affinity + adjustment));

      await prisma.userRecipeStyle.update({
        where: {
          userId_styleId: { userId, styleId: style.id }
        },
        data: {
          affinity: newAffinity,
          recipesCooked: { increment: 1 }
        }
      });
    } else if (didLike) {
      await prisma.userRecipeStyle.create({
        data: {
          userId,
          styleId: style.id,
          affinity: 0.5,
          recipesCooked: 1
        }
      });
    }
  }
}
