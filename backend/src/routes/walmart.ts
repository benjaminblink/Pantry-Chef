import express, { Request, Response, Router } from 'express';
import { searchWalmartProducts, getWalmartProduct, findIngredientPrice } from '../services/walmart.js';
import { calculatePurchaseCount } from '../services/unitConversionService.js';
import { prisma } from '../index.js';
import {
  grantWalmartCheckoutCredits,
  markUsagesEligibleForPayout,
  getBalance,
} from '../services/credit.js';

const router: Router = express.Router();

// Middleware to check if Walmart API is configured
const checkWalmartConfig = (req: Request, res: Response, next: express.NextFunction) => {
  const consumerId = process.env.WALMART_CONSUMER_ID;
  const privateKey = process.env.WALMART_PRIVATE_KEY;

  if (!consumerId || !privateKey) {
    return res.status(503).json({
      success: false,
      message: 'Walmart API is not configured. Please set WALMART_CONSUMER_ID and WALMART_PRIVATE_KEY in environment variables.',
    });
  }

  // Attach credentials to request for use in routes
  (req as any).walmartConfig = {
    consumerId,
    privateKey,
  };
  next();
};

// Apply middleware to all routes
router.use(checkWalmartConfig);

/**
 * @route   GET /api/walmart/search
 * @desc    Search for products on Walmart
 * @query   q - Search query
 * @access  Public
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Search query (q) is required',
      });
    }

    const { consumerId, privateKey } = (req as any).walmartConfig;
    const searchResult = await searchWalmartProducts(q, consumerId, privateKey);

    res.json({
      success: true,
      data: searchResult,
    });
  } catch (error: any) {
    console.error('Walmart search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search Walmart products',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/walmart/product/:itemId
 * @desc    Get product details by item ID
 * @param   itemId - Walmart item ID
 * @access  Public
 */
router.get('/product/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'Item ID is required',
      });
    }

    const { consumerId, privateKey } = (req as any).walmartConfig;
    const product = await getWalmartProduct(itemId as string, consumerId, privateKey);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      data: { product },
    });
  } catch (error: any) {
    console.error('Walmart product lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get product details',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/walmart/ingredient/:ingredientName
 * @desc    Find best Walmart product match for an ingredient
 * @param   ingredientName - Name of the ingredient
 * @access  Public
 */
router.get('/ingredient/:ingredientName', async (req: Request, res: Response) => {
  try {
    const { ingredientName } = req.params;

    if (!ingredientName) {
      return res.status(400).json({
        success: false,
        message: 'Ingredient name is required',
      });
    }

    const { consumerId, privateKey } = (req as any).walmartConfig;
    const product = await findIngredientPrice(ingredientName as string, consumerId, privateKey);

    if (!product) {
      return res.json({
        success: true,
        data: { product: null },
        message: 'No matching product found',
      });
    }

    res.json({
      success: true,
      data: { product },
    });
  } catch (error: any) {
    console.error('Walmart ingredient price lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find ingredient price',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/walmart/similar/:ingredientName
 * @desc    Find similar Walmart products for an ingredient
 * @param   ingredientName - Name of the ingredient
 * @query   limit - Number of results to return (default: 10)
 * @access  Public
 */
router.get('/similar/:ingredientName', async (req: Request, res: Response) => {
  try {
    const { ingredientName } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const tier = req.query.tier as string | undefined;

    if (!ingredientName) {
      return res.status(400).json({
        success: false,
        message: 'Ingredient name is required',
      });
    }

    const { consumerId, privateKey } = (req as any).walmartConfig;
    const searchResult = await searchWalmartProducts(ingredientName as string, consumerId, privateKey);

    let items = searchResult.items;

    // If tier filter is specified, filter products by tier
    if (tier && ['budget', 'standard', 'premium', 'organic'].includes(tier)) {
      const { classifyProductsByTier } = await import('../services/ingredientSubstitutionService.js');
      const tiers = classifyProductsByTier(items);
      const selectedTier = tiers.find((t) => t.tier === tier);
      if (selectedTier) {
        items = selectedTier.products;
      }
    }

    // Return up to limit items
    items = items.slice(0, limit);

    res.json({
      success: true,
      data: {
        items,
        totalResults: searchResult.totalResults,
        query: searchResult.query,
        displayedCount: items.length,
        ...(tier && { filteredByTier: tier }),
      },
    });
  } catch (error: any) {
    console.error('Walmart similar products lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find similar products',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/walmart/recipe-pricing
 * @desc    Get pricing for all ingredients in a recipe
 * @body    ingredients - Array of ingredient names
 * @access  Public
 */
router.post('/recipe-pricing', async (req: Request, res: Response) => {
  try {
    const { ingredients } = req.body;

    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({
        success: false,
        message: 'ingredients array is required',
      });
    }

    const { consumerId, privateKey } = (req as any).walmartConfig;

    // Fetch all prices in parallel for better performance
    const results = await Promise.all(
      ingredients.map(async (ingredient: any) => {
        try {
          const product = await findIngredientPrice(
            ingredient.name || ingredient,
            consumerId,
            privateKey
          );

          let purchaseCount = null;
          let purchaseUnit = null;
          let reasoning = null;

          // If we have product, amount, and unit, calculate purchase count
          if (product && product.size && ingredient.amount && ingredient.unit) {
            const purchaseCalc = await calculatePurchaseCount(
              ingredient.amount,
              ingredient.unit,
              product.size,
              ingredient.name || ingredient
            );
            purchaseCount = purchaseCalc.packageCount;
            purchaseUnit = purchaseCalc.packageUnit;
            reasoning = purchaseCalc.reasoning;
          }

          return {
            ingredient: ingredient,
            product: product,
            purchaseCount,
            purchaseUnit,
            reasoning,
          };
        } catch (error: any) {
          console.error(`Error fetching price for ${ingredient.name || ingredient}:`, error);
          return {
            ingredient: ingredient,
            product: null,
            error: error.message,
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        results,
        totalIngredients: ingredients.length,
        foundPrices: results.filter(r => r.product !== null).length,
      },
    });
  } catch (error: any) {
    console.error('Walmart recipe pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recipe pricing',
      error: error.message,
    });
  }
});

/**
 * POST /api/walmart/checkout
 * Record that user completed a Walmart checkout
 * - Grants declining credits (15→10→5)
 * - Marks recipe usages as eligible for creator payout
 */
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    // @ts-ignore - userId set by auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Grant declining credits
    const creditsGranted = await grantWalmartCheckoutCredits(userId);

    // Mark recipe usages as eligible for payout
    const usagesMarked = await markUsagesEligibleForPayout(userId);

    // Get new balance
    const newBalance = await getBalance(userId);

    return res.json({
      success: true,
      message: `Walmart checkout recorded! You earned ${creditsGranted} credits.`,
      creditsGranted,
      balance: newBalance,
      creatorsSupported: usagesMarked,
    });
  } catch (error: any) {
    console.error('Walmart checkout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record Walmart checkout',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/walmart/checkout/info
 * Get information about next Walmart checkout reward
 */
router.get('/checkout/info', async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalWalmartCheckouts: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const checkoutNumber = user.totalWalmartCheckouts + 1;
    let nextReward: number;

    if (checkoutNumber === 1) {
      nextReward = 15;
    } else if (checkoutNumber === 2) {
      nextReward = 10;
    } else {
      nextReward = 5; // Steady state
    }

    return res.json({
      success: true,
      checkoutNumber,
      nextReward,
      totalCheckouts: user.totalWalmartCheckouts,
      isSteadyState: checkoutNumber > 2,
    });
  } catch (error: any) {
    console.error('Get checkout info error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get checkout info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
