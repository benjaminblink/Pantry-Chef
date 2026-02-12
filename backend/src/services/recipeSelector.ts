// Recipe Selector Service
// Intelligently selects existing recipes based on preferences, style, and inventory

import { Recipe, UserInventory, UserRecipeStyle } from '@prisma/client';
import { prisma } from '../index.js';
import { AgentParameters } from './preferenceMapper.js';
import { analyzeRecipeStyle } from './recipeStyleLearner.js';

interface SelectionCriteria {
  userId: string;
  count: number;
  preferences: AgentParameters;
  userStyles: UserRecipeStyle[];
  inventory: UserInventory[];
  excludeRecentlyUsed: boolean;
  mealType?: string;
}

interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  styleMatchScore: number;
  ratingScore: number;
  inventoryScore: number;
}

/**
 * Get meal types for a recipe
 */
function getMealTypes(recipe: any): string[] {
  if (recipe.mealType && recipe.mealType.length > 0) {
    return recipe.mealType;
  }

  const title = recipe.title.toLowerCase();
  const description = (recipe.description || '').toLowerCase();
  const text = `${title} ${description}`;

  const breakfastKeywords = ['breakfast', 'oatmeal', 'pancake', 'waffle', 'toast', 'egg', 'omelet', 'frittata', 'smoothie', 'yogurt', 'granola', 'cereal', 'muffin', 'bagel'];
  const dinnerKeywords = ['dinner', 'stir-fry', 'stir fry', 'roasted', 'grilled', 'baked', 'seared', 'braised', 'casserole', 'stew', 'curry'];

  const mealTypes: string[] = [];

  const isBreakfast = breakfastKeywords.some(kw => text.includes(kw));
  const isDinner = dinnerKeywords.some(kw => text.includes(kw));

  if (isBreakfast) mealTypes.push('breakfast');
  if (isDinner || (!isBreakfast && !mealTypes.length)) {
    mealTypes.push('dinner', 'lunch');
  }
  if (!isBreakfast && !isDinner) {
    mealTypes.push('breakfast', 'lunch', 'dinner');
  }

  return mealTypes.length > 0 ? mealTypes : ['breakfast', 'lunch', 'dinner'];
}

/**
 * Normalize protein ingredient names to base protein type
 */
function normalizeProteinName(ingredientName: string): string {
  const normalized = ingredientName.toLowerCase().trim();

  const proteinMap: Record<string, string> = {
    'salmon': 'salmon',
    'cod': 'cod',
    'shrimp': 'shrimp',
    'tuna': 'tuna',
    'chicken': 'chicken',
    'beef': 'beef',
    'pork': 'pork',
    'turkey': 'turkey',
    'tofu': 'tofu',
    'tempeh': 'tempeh',
    'seitan': 'seitan',
    'tilapia': 'tilapia',
    'halibut': 'halibut',
    'mahi': 'mahi-mahi',
    'snapper': 'snapper',
    'trout': 'trout',
    'scallops': 'scallops',
    'mussels': 'mussels',
    'clams': 'clams',
    'crab': 'crab',
    'lobster': 'lobster',
  };

  for (const [key, value] of Object.entries(proteinMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return normalized.split(/[\s,\(]/)[0];
}

/**
 * Check if a recipe meets dietary restrictions
 */
function matchesDietaryRestrictions(
  recipe: any,
  dietaryRestrictions: string[]
): boolean {
  if (!dietaryRestrictions || dietaryRestrictions.length === 0) {
    return true;
  }

  const ingredients = recipe.recipeIngredients.map((ri: any) =>
    ri.ingredient.name.toLowerCase()
  );

  const meatPoultry = ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'duck', 'veal', 'goat', 'venison'];
  const seafood = ['salmon', 'cod', 'shrimp', 'tuna', 'fish', 'prawn', 'scallop', 'mussel', 'clam', 'crab', 'lobster', 'tilapia', 'halibut', 'mahi', 'snapper', 'trout', 'bass', 'catfish', 'pollock', 'sardine', 'anchov'];

  for (const restriction of dietaryRestrictions) {
    const normalizedRestriction = restriction.toLowerCase();

    if (normalizedRestriction === 'pescatarian') {
      const hasMeat = ingredients.some((ing: string) =>
        meatPoultry.some(meat => ing.includes(meat))
      );
      if (hasMeat) {
        return false;
      }
    } else if (normalizedRestriction === 'vegetarian') {
      const hasAnimalProtein = ingredients.some((ing: string) =>
        [...meatPoultry, ...seafood].some(protein => ing.includes(protein))
      );
      if (hasAnimalProtein) {
        return false;
      }
    } else if (normalizedRestriction === 'vegan') {
      const animalProducts = [...meatPoultry, ...seafood, 'egg', 'dairy', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'honey'];
      const hasAnimalProduct = ingredients.some((ing: string) =>
        animalProducts.some(product => ing.includes(product))
      );
      if (hasAnimalProduct) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Intelligently selects existing recipes that match user's preferences and style
 */
export async function selectExistingRecipes(
  criteria: SelectionCriteria
): Promise<Recipe[]> {
  const where: any = {
    createdById: criteria.userId
  };

  if (criteria.preferences.calorieTargetPerDay) {
    const mealCalories = criteria.preferences.calorieTargetPerDay / 3;
    const tolerance = 150;
    where.calories = {
      gte: mealCalories - tolerance,
      lte: mealCalories + tolerance
    };
  }

  let recentRecipeIds: string[] = [];

  if (criteria.excludeRecentlyUsed) {
    const recentMealPlans = await prisma.mealPlan.findMany({
      where: {
        userId: criteria.userId,
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
      },
      include: {
        mealSlots: { select: { recipeId: true } }
      }
    });

    recentRecipeIds = recentMealPlans
      .flatMap(mp => mp.mealSlots.map(slot => slot.recipeId))
      .filter(Boolean) as string[];
  }

  console.log(`🔍 Recipe Selection Filters:`);
  console.log(`   User ID: ${criteria.userId}`);
  if (where.calories) {
    console.log(`   Calories: ${where.calories.gte} - ${where.calories.lte}`);
  }
  if (recentRecipeIds.length > 0) {
    console.log(`   ${recentRecipeIds.length} recently used recipes available to exclude`);
  }

  if (recentRecipeIds.length > 0) {
    where.id = { notIn: recentRecipeIds };
  }

  let candidates = await prisma.recipe.findMany({
    where,
    include: {
      recipeIngredients: {
        include: { ingredient: true }
      },
      history: {
        where: { userId: criteria.userId }
      }
    }
  });

  candidates = candidates.filter(recipe =>
    matchesDietaryRestrictions(recipe, criteria.preferences.dietaryRestrictions)
  );

  if (criteria.mealType) {
    const beforeMealTypeFilter = candidates.length;
    candidates = candidates.filter(recipe => {
      const recipeMealTypes = getMealTypes(recipe);
      return recipeMealTypes.includes(criteria.mealType!);
    });
    console.log(`   🍽️  Meal type filter (${criteria.mealType}): ${beforeMealTypeFilter} → ${candidates.length} recipes`);
  }

  let proteinCounts = candidates.reduce((acc, recipe) => {
    const proteins = recipe.recipeIngredients
      .filter(ri => ['Seafood', 'Meat', 'Protein'].includes(ri.ingredient.category || ''))
      .map(ri => normalizeProteinName(ri.ingredient.name));
    proteins.forEach(p => {
      acc[p] = (acc[p] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const uniqueProteins = Object.keys(proteinCounts).length;

  console.log(`📚 Found ${candidates.length} candidate recipes (excluding recent)`);
  console.log(`   Protein variety: ${uniqueProteins} unique types`, proteinCounts);

  if (uniqueProteins <= 2 && recentRecipeIds.length > 0 && candidates.length > 0) {
    console.log(`⚠️  Low protein diversity detected! Retrying WITHOUT recent recipe exclusion...`);

    delete where.id;

    let candidatesWithRecent = await prisma.recipe.findMany({
      where,
      include: {
        recipeIngredients: {
          include: { ingredient: true }
        },
        history: {
          where: { userId: criteria.userId }
        }
      }
    });

    candidatesWithRecent = candidatesWithRecent.filter(recipe =>
      matchesDietaryRestrictions(recipe, criteria.preferences.dietaryRestrictions)
    );

    const proteinCountsWithRecent = candidatesWithRecent.reduce((acc, recipe) => {
      const proteins = recipe.recipeIngredients
        .filter(ri => ['Seafood', 'Meat', 'Protein'].includes(ri.ingredient.category || ''))
        .map(ri => normalizeProteinName(ri.ingredient.name));
      proteins.forEach(p => {
        acc[p] = (acc[p] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const uniqueProteinsWithRecent = Object.keys(proteinCountsWithRecent).length;

    if (uniqueProteinsWithRecent > uniqueProteins) {
      console.log(`✅ Including recent recipes improves diversity: ${uniqueProteins} → ${uniqueProteinsWithRecent} protein types`);
      candidates = candidatesWithRecent;
      proteinCounts = proteinCountsWithRecent;
    } else {
      console.log(`❌ Including recent recipes doesn't help diversity, keeping original filter`);
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const scoredRecipes: ScoredRecipe[] = candidates.map(recipe => {
    const scores = scoreRecipe(recipe, criteria);
    return {
      recipe,
      score: scores.total,
      styleMatchScore: scores.style,
      ratingScore: scores.rating,
      inventoryScore: scores.inventory
    };
  });

  const selectedRecipes = await selectDiverseRecipes(scoredRecipes, criteria.count);
  return selectedRecipes;
}

/**
 * Select recipes with true randomness
 */
async function selectDiverseRecipes(
  scoredRecipes: ScoredRecipe[],
  count: number
): Promise<Recipe[]> {
  if (scoredRecipes.length <= count) {
    const shuffled = [...scoredRecipes].sort(() => Math.random() - 0.5);
    return shuffled.map(sr => sr.recipe);
  }

  const shuffled = [...scoredRecipes].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  console.log(`✅ Randomly selected ${selected.length}/${scoredRecipes.length} recipes`);
  selected.forEach((sr, i) => {
    console.log(`📊 Recipe ${i + 1}/${count}: "${sr.recipe.title}"`);
  });

  return selected.map(sr => sr.recipe);
}

/**
 * Score a recipe based on multiple criteria
 */
function scoreRecipe(
  recipe: any,
  criteria: SelectionCriteria
): { total: number; style: number; rating: number; inventory: number } {
  let styleScore = 0;
  let ratingScore = 0;
  let inventoryScore = 0;

  const recipeStyle = analyzeRecipeStyle(recipe);
  const topUserStyles = criteria.userStyles.slice(0, 5);

  for (const userStyle of topUserStyles) {
    const styleName = (userStyle as any).style?.name || userStyle.styleId;
    const matchesStyle =
      recipeStyle.cookingMethods.includes(styleName) ||
      recipeStyle.cuisineStyles.includes(styleName) ||
      recipeStyle.timingProfiles.includes(styleName) ||
      recipeStyle.complexity.includes(styleName) ||
      recipeStyle.dietaryPatterns.includes(styleName);

    if (matchesStyle) {
      styleScore += userStyle.affinity * 10;
    }
  }

  const history = recipe.history[0];
  if (history) {
    if (history.isFavorite) ratingScore += 15;
    if (history.rating) ratingScore += history.rating * 2;
    if (history.wouldMakeAgain) ratingScore += 10;
    if (history.didCook) ratingScore += 5;
  }

  if (criteria.inventory.length > 0) {
    const inventoryIds = new Set(criteria.inventory.map(inv => inv.ingredientId));
    const matchingIngredients = recipe.recipeIngredients.filter((ri: any) =>
      inventoryIds.has(ri.ingredientId)
    );
    if (recipe.recipeIngredients.length > 0) {
      inventoryScore = (matchingIngredients.length / recipe.recipeIngredients.length) * 25;
    }
  }

  const totalScore = styleScore + ratingScore + inventoryScore;

  return {
    total: totalScore,
    style: styleScore,
    rating: ratingScore,
    inventory: inventoryScore
  };
}

/**
 * Find similar recipes to a given recipe
 */
export async function findSimilarRecipes(
  recipeId: string,
  userId: string,
  limit: number = 5
): Promise<Recipe[]> {
  const sourceRecipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      recipeIngredients: {
        include: { ingredient: true }
      }
    }
  });

  if (!sourceRecipe) return [];

  const sourceStyle = analyzeRecipeStyle(sourceRecipe);

  const candidates = await prisma.recipe.findMany({
    where: {
      id: { not: recipeId },
      createdById: userId
    },
    include: {
      recipeIngredients: {
        include: { ingredient: true }
      }
    },
    take: 50
  });

  const scored = candidates.map(recipe => {
    const recipeStyle = analyzeRecipeStyle(recipe);
    let similarity = 0;

    const allSourceStyles = [
      ...sourceStyle.cookingMethods,
      ...sourceStyle.cuisineStyles,
      ...sourceStyle.timingProfiles,
      ...sourceStyle.complexity
    ];

    const allRecipeStyles = [
      ...recipeStyle.cookingMethods,
      ...recipeStyle.cuisineStyles,
      ...recipeStyle.timingProfiles,
      ...recipeStyle.complexity
    ];

    for (const style of allSourceStyles) {
      if (allRecipeStyles.includes(style)) {
        similarity += 1;
      }
    }

    if (sourceRecipe.calories && recipe.calories) {
      const calorieDiff = Math.abs(sourceRecipe.calories - recipe.calories);
      if (calorieDiff < 100) similarity += 2;
      else if (calorieDiff < 200) similarity += 1;
    }

    return { recipe, similarity };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit).map(s => s.recipe);
}
