// Cart routes for shopping cart functionality
// Handles cart generation from recipes, Walmart product enrichment, and checkout
import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import { combineIngredients, normalizeUnit } from '../utils/unitConversion.js';
import { createConsolidatedCart, searchWalmartProducts, type WalmartCartItem } from '../services/walmart.js';
import { parseProductSize, calculatePackageQuantity } from '../utils/productSizeCalculator.js';
import { detectSimilarIngredients, applyMergeDecisions, type PotentialMerge, type CartItem } from '../services/ingredientSimilarity.js';
import { calculatePurchaseCount } from '../services/unitConversionService.js';

const router = Router();

/**
 * Charge credits for recipe usage when adding to cart
 * Currently DISABLED for competition - recipe use is free to maximize Walmart checkouts
 * Will be re-enabled post-competition with creator economy
 */
async function chargeRecipeUsageCredits(userId: string, recipeData: any[]): Promise<Response | null> {
  const { hasEnoughCredits, chargeCredits, getBalance } = await import('../services/credit.js');

  let totalCreditsNeeded = 0;
  for (const recipe of recipeData) {
    if (recipe.usageCost > 0) {
      totalCreditsNeeded += recipe.usageCost;
    }
  }

  if (totalCreditsNeeded > 0) {
    const hasCredits = await hasEnoughCredits(userId, totalCreditsNeeded);
    if (!hasCredits) {
      const balance = await getBalance(userId);
      return { status: 402, body: {
        error: 'Insufficient credits',
        message: `You need ${totalCreditsNeeded} credits to add these recipes to cart`,
        data: {
          required: totalCreditsNeeded,
          current: balance,
          shortfall: totalCreditsNeeded - balance,
        },
      }} as any;
    }

    for (const recipe of recipeData) {
      if (recipe.usageCost > 0) {
        await chargeCredits(
          userId,
          recipe.usageCost,
          'RECIPE_USE',
          `${recipe.isImported ? 'Imported' : 'Community'} recipe: ${recipe.title}`
        );
        console.log(`Charged ${recipe.usageCost} credits for recipe: ${recipe.title}`);
      }
    }
  }

  return null;
}

export interface RecipeSelection {
  recipeId: string;
  quantity: number;
}

export interface CartResponse {
  shoppingListId: string;
  recipes: Array<{
    recipeId: string;
    recipeTitle: string;
    quantity: number;
  }>;
  ingredients: CartItem[];
  potentialMerges: PotentialMerge[];
  createdAt: Date;
}

/**
 * POST /api/cart/generate
 * Generate a shopping cart from selected recipes
 *
 * Process:
 * 1. Fetch all selected recipes with their ingredients
 * 2. Aggregate ingredients, combining quantities where possible
 * 3. Detect similar ingredients that could be merged (auto-merge ≥95% confidence)
 * 4. Return cart with ingredients and suggested merges for user review
 *
 * Body: { recipes: [{ recipeId: string, quantity: number }] }
 */
router.post('/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { recipes, clearCart = true } = req.body as { recipes: RecipeSelection[]; clearCart?: boolean };

    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'Recipes array is required' });
    }

    console.log(`Generating cart for ${recipes.length} recipe selections (clearCart: ${clearCart})`);

    // Fetch all recipes with their ingredients
    const recipeIds = recipes.map(r => r.recipeId);
    const recipeData = await prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      include: {
        recipeIngredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (recipeData.length === 0) {
      return res.status(404).json({ error: 'No recipes found' });
    }

    const userId = req.user!.userId;

    // Recipe use is FREE for competition - never gate the path to Walmart checkout
    // Re-enable post-competition with creator economy:
    // const creditError = await chargeRecipeUsageCredits(userId, recipeData);
    // if (creditError) return res.status(creditError.status).json(creditError.body);

    // Build ingredient map (combining quantities from multiple recipes)
    const ingredientMap = new Map<string, CartItem>();

    // If not clearing cart, load existing active cart items and merge them
    if (!clearCart) {
      const existingCart = await prisma.shoppingList.findFirst({
        where: { userId, isActive: true },
        include: {
          items: {
            include: {
              ingredient: true,
            },
          },
        },
      });

      if (existingCart && existingCart.items.length > 0) {
        console.log(`Merging with existing cart (${existingCart.items.length} items)`);
        for (const item of existingCart.items) {
          const amount = parseFloat(item.totalAmount);
          ingredientMap.set(item.ingredient.id, {
            ingredientId: item.ingredient.id,
            ingredientName: item.ingredient.name,
            amount,
            unit: item.unit,
            walmartItemId: item.ingredient.walmartItemId,
            walmartSearchTerm: item.ingredient.walmartSearchTerm,
            recipes: ['Existing cart'],
            recipeBreakdown: [{
              recipeId: 'existing',
              recipeTitle: 'Existing cart',
              amount,
              unit: item.unit,
            }],
          });
        }
      }
    }

    for (const recipeSelection of recipes) {
      const recipe = recipeData.find(r => r.id === recipeSelection.recipeId);
      if (!recipe) continue;

      const multiplier = recipeSelection.quantity; // How many times we're making this recipe

      for (const ri of recipe.recipeIngredients) {
        const ingredientId = ri.ingredient.id;
        const ingredientName = ri.ingredient.name;
        const amount = ri.amount * multiplier;
        const unit = ri.unit;

        if (ingredientMap.has(ingredientId)) {
          // Combine with existing ingredient
          const existing = ingredientMap.get(ingredientId)!;

          try {
            // Try to combine units (will throw if incompatible types)
            const combined = combineIngredients(
              existing.amount,
              existing.unit,
              amount,
              unit
            );

            existing.amount = combined.amount;
            existing.unit = combined.unit;
            existing.recipes.push(recipe.title);

            // Add to recipe breakdown
            if (!existing.recipeBreakdown) {
              existing.recipeBreakdown = [];
            }
            existing.recipeBreakdown.push({
              recipeId: recipe.id,
              recipeTitle: recipe.title,
              amount,
              unit,
            });
          } catch (error) {
            // If units can't be combined (different types), keep as separate entries
            // Create a new entry with a suffix
            const newKey = `${ingredientId}_${unit}`;
            ingredientMap.set(newKey, {
              ingredientId,
              ingredientName,
              amount,
              unit,
              walmartItemId: ri.ingredient.walmartItemId,
              walmartSearchTerm: ri.ingredient.walmartSearchTerm,
              recipes: [recipe.title],
              recipeBreakdown: [{
                recipeId: recipe.id,
                recipeTitle: recipe.title,
                amount,
                unit,
              }],
            });
          }
        } else {
          // First occurrence of this ingredient - normalize the unit
          const normalized = normalizeUnit(amount, unit);
          ingredientMap.set(ingredientId, {
            ingredientId,
            ingredientName,
            amount: normalized.amount,
            unit: normalized.unit,
            walmartItemId: ri.ingredient.walmartItemId,
            walmartSearchTerm: ri.ingredient.walmartSearchTerm,
            recipes: [recipe.title],
            recipeBreakdown: [{
              recipeId: recipe.id,
              recipeTitle: recipe.title,
              amount,
              unit,
            }],
          });
        }
      }
    }

    const ingredients = Array.from(ingredientMap.values());

    console.log(`Generated cart with ${ingredients.length} unique ingredients (before auto-merge)`);

    // Detect similar ingredients and auto-merge high confidence matches
    // - ≥95% similarity → auto-merge
    // - 70-95% → suggest to user
    // - 40-70% → AI verification then suggest
    const mergeResult = await detectSimilarIngredients(ingredients);

    // Combine auto-merged + non-matched ingredients for the final cart
    const finalIngredients = [...mergeResult.autoMerged, ...mergeResult.noMerge];

    console.log(`Auto-merged ${mergeResult.autoMerged.length} ingredient groups`);
    console.log(`Final ingredient count: ${finalIngredients.length}`);
    console.log(`Potential merges for user review: ${mergeResult.suggestedMerges.length}`);

    // Calculate default purchase quantities for each ingredient
    // Keep original units until enriched with Walmart data
    const ingredientsWithPurchaseQty = finalIngredients.map((ingredient) => ({
      ...ingredient,
      purchaseQuantity: ingredient.amount, // Default to recipe amount
      purchaseUnit: ingredient.unit, // Keep original unit for now
    }));

    // Persist to database — deactivate any existing active cart (always clear), then create new one
    // Note: Even when clearCart=false, we deactivate the old cart because we've merged its items into the new cart
    await prisma.shoppingList.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const shoppingList = await prisma.shoppingList.create({
      data: {
        userId,
        mealPlanId: null,
        source: 'recipe_selection',
        isActive: true,
        totalEstimatedCost: 0,
        items: {
          create: finalIngredients.map(item => ({
            ingredientId: item.ingredientId,
            totalAmount: item.amount.toString(),
            unit: item.unit,
            walmartItemId: item.walmartItemId || null,
            estimatedPrice: null,
          })),
        },
        mergeOptions: {
          create: mergeResult.suggestedMerges.map(merge => ({
            mergeId: merge.mergeId,
            ingredientIds: merge.ingredients.map((i: CartItem) => i.ingredientId),
            canonicalUnit: merge.canonicalUnit || merge.unit || '',
            conversionRatios: merge.conversionRatios || merge.ingredients.map(() => 1.0),
            userDecision: null,
          })),
        },
      },
    });

    console.log(`Shopping list ${shoppingList.id} created from recipe selection`);

    const response: CartResponse = {
      shoppingListId: shoppingList.id,
      recipes: recipes.map(r => ({
        recipeId: r.recipeId,
        recipeTitle: recipeData.find(rd => rd.id === r.recipeId)?.title || '',
        quantity: r.quantity,
      })),
      ingredients: ingredientsWithPurchaseQty,
      potentialMerges: mergeResult.suggestedMerges,
      createdAt: new Date(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating cart:', error);
    res.status(500).json({ error: 'Failed to generate cart' });
  }
});

/**
 * GET /api/cart/active
 * Get the user's currently active shopping cart/list
 * Returns the active ShoppingList with items and merge options, or null
 */
router.get('/active', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const activeList = await prisma.shoppingList.findFirst({
      where: { userId, isActive: true },
      include: {
        items: { include: { ingredient: true } },
        mergeOptions: true,
        mealPlan: { select: { id: true, name: true } },
      },
    });

    res.json({ shoppingList: activeList });
  } catch (error) {
    console.error('Error fetching active cart:', error);
    res.status(500).json({ error: 'Failed to fetch active cart' });
  }
});

/**
 * DELETE /api/cart/active
 * Clear the user's active shopping cart
 * Sets isActive=false so it won't be loaded again
 */
router.delete('/active', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const result = await prisma.shoppingList.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    res.json({ success: true, cleared: result.count });
  } catch (error) {
    console.error('Error clearing active cart:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

/**
 * POST /api/cart/enrich-walmart
 * Enrich cart items with Walmart product data
 *
 * Process:
 * 1. Search Walmart API for each ingredient
 * 2. Calculate how many packages are needed based on product size
 * 3. Add Walmart product data to each cart item
 *
 * Body: { ingredients: CartItem[] }
 */
router.post('/enrich-walmart', async (req, res) => {
  try {
    const { ingredients } = req.body as { ingredients: CartItem[] };

    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'Ingredients array is required' });
    }

    const consumerId = process.env.WALMART_CONSUMER_ID;
    const privateKey = process.env.WALMART_PRIVATE_KEY;

    if (!consumerId || !privateKey) {
      return res.status(500).json({ error: 'Walmart API credentials not configured' });
    }

    console.log(`Enriching ${ingredients.length} ingredients with Walmart data`);

    // Search Walmart for each ingredient
    const enrichedIngredients = await Promise.all(
      ingredients.map(async (item) => {
        try {
          // Use existing walmartSearchTerm if available, otherwise use ingredient name + unit
          const searchTerm = item.walmartSearchTerm || `${item.ingredientName} ${item.amount} ${item.unit}`;

          console.log(`Searching Walmart for: ${searchTerm}`);
          const searchResult = await searchWalmartProducts(searchTerm, consumerId, privateKey);

          if (searchResult.items && searchResult.items.length > 0) {
            const product = searchResult.items[0];

            // Calculate package count using database-backed unit conversion service
            let packageCount = 1;
            let packageSize = product.size || 'Unknown size';
            let purchaseUnit = 'count';

            if (product.size) {
              const purchaseCalc = await calculatePurchaseCount(
                item.amount,
                item.unit,
                product.size,
                item.ingredientName
              );

              packageCount = purchaseCalc.packageCount;
              packageSize = purchaseCalc.packageSize;
              purchaseUnit = purchaseCalc.packageUnit;

              console.log(`  → ${purchaseCalc.reasoning}`);
            }

            return {
              ...item,
              walmartProduct: {
                itemId: product.itemId,
                name: product.name,
                salePrice: product.salePrice,
                thumbnailImage: product.thumbnailImage,
                productTrackingUrl: product.productTrackingUrl,
                size: product.size,
              },
              packageCount,
              packageSize,
              purchaseUnit, // Display as "count" in frontend
            };
          }

          // No Walmart product found
          return item;
        } catch (error) {
          console.error(`Error searching Walmart for ${item.ingredientName}:`, error);
          return item;
        }
      })
    );

    res.json({ ingredients: enrichedIngredients });
  } catch (error) {
    console.error('Error enriching cart with Walmart data:', error);
    res.status(500).json({ error: 'Failed to enrich cart with Walmart data' });
  }
});

/**
 * POST /api/cart/apply-merges
 * Apply user's merge decisions from the review screen
 *
 * Takes the suggested merges and the user's decisions,
 * then returns the updated ingredient list with merges applied.
 *
 * Body: {
 *   suggestedMerges: PotentialMerge[],
 *   mergeDecisions: Array<{ mergeId: string, decision: boolean }>
 * }
 */
router.post('/apply-merges', async (req, res) => {
  try {
    const { suggestedMerges, mergeDecisions } = req.body as {
      suggestedMerges: PotentialMerge[];
      mergeDecisions: Array<{ mergeId: string; decision: boolean }>;
    };

    if (!suggestedMerges || !mergeDecisions) {
      return res.status(400).json({ error: 'suggestedMerges and mergeDecisions are required' });
    }

    console.log(`Applying ${mergeDecisions.length} merge decisions`);

    // Convert merge decisions to Map
    const decisionsMap = new Map<string, boolean>();
    mergeDecisions.forEach(({ mergeId, decision }) => {
      decisionsMap.set(mergeId, decision);
    });

    // Apply merge decisions using the service
    const mergedIngredients = applyMergeDecisions(suggestedMerges, decisionsMap);

    res.json({ ingredients: mergedIngredients });
  } catch (error) {
    console.error('Error applying merge decisions:', error);
    res.status(500).json({ error: 'Failed to apply merge decisions' });
  }
});

/**
 * POST /api/cart/checkout
 * Create a Walmart consolidated cart and return the checkout URL
 *
 * Uses Walmart Affiliate API v2 to create a cart with all items
 * Returns a cart URL that the user can visit to complete their purchase
 *
 * Body: { items: [{ itemId: string, quantity: number }] }
 */
router.post('/checkout', async (req, res) => {
  try {
    const { items } = req.body as { items: WalmartCartItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const consumerId = process.env.WALMART_CONSUMER_ID;
    const privateKey = process.env.WALMART_PRIVATE_KEY;
    const publisherId = process.env.WALMART_PUBLISHER_ID; // Optional Impact Radius ID

    if (!consumerId || !privateKey) {
      return res.status(500).json({ error: 'Walmart API credentials not configured' });
    }

    console.log(`Creating Walmart cart with ${items.length} items`);

    const result = await createConsolidatedCart(items, consumerId, privateKey, publisherId);

    if (result.error) {
      return res.status(400).json({
        error: result.error,
        message: result.message,
        details: 'This may require an Impact Radius Publisher ID. Check the logs for details.',
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error creating Walmart cart:', error);
    res.status(500).json({ error: 'Failed to create Walmart cart' });
  }
});

export default router;
