import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateRecipeRecommendations } from '../services/openai.js';
import { recordRecipeUsage } from '../services/credit.js';

const router = Router();

// Validation schemas
const recommendationSchema = z.object({
  preferences: z.object({
    dietaryRestrictions: z.array(z.string()).optional(),
    favoredCuisines: z.array(z.string()).optional(),
    allergies: z.array(z.string()).optional(),
    calorieTarget: z.number().optional(),
  }).optional(),
  count: z.number().min(1).max(10).default(5),
});

const ratingSchema = z.object({
  rating: z.number().min(1).max(5),
  isFavorite: z.boolean().optional(),
});

const createRecipeSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  instructions: z.union([z.array(z.string()), z.string()]),
  prepTimeMinutes: z.number().min(0).default(0),
  cookTimeMinutes: z.number().min(0).default(0),
  servings: z.number().min(1).default(1),
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  imageUrl: z.string().optional(),
  isPublic: z.boolean().default(false),
  ingredients: z.array(z.object({
    ingredientId: z.string(),
    amount: z.number(),
    unit: z.string(),
    notes: z.string().optional(),
  })),
});

// GET /api/recipes - Get all recipes (with pagination, protected)
// Query params: page, limit, view (personal, all)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const view = req.query.view as string || 'all'; // 'personal' or 'all'
    const userId = req.user!.userId;

    // Build filter based on view
    let whereClause: any = {};

    if (view === 'personal') {
      // Show only user's own recipes (both public and private)
      whereClause = { createdById: userId };
    } else {
      // Show user's own recipes + public recipes (from AI and other users)
      whereClause = {
        OR: [
          { createdById: userId },
          { isPublic: true },
        ],
      };
    }

    const [recipes, total] = await Promise.all([
      prisma.recipe.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          recipeIngredients: {
            include: {
              ingredient: true,
            },
            orderBy: {
              sortOrder: 'asc',
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.recipe.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: {
        recipes,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get recipes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recipes',
    });
  }
});

// POST /api/recipes - Create new recipe (protected)
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = createRecipeSchema.parse(req.body);
    const userId = req.user!.userId;

    // Create recipe with ingredients in a transaction
    const recipe = await prisma.recipe.create({
      data: {
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        prepTime: data.prepTimeMinutes,
        cookTime: data.cookTimeMinutes,
        servings: data.servings,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        imageUrl: data.imageUrl,
        isPublic: data.isPublic,
        createdById: userId,
        recipeIngredients: {
          create: data.ingredients.map((ing, index) => ({
            ingredientId: ing.ingredientId,
            amount: ing.amount,
            unit: ing.unit,
            notes: ing.notes,
            sortOrder: index,
          })),
        },
      },
      include: {
        recipeIngredients: {
          include: {
            ingredient: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Recipe created successfully',
      data: { recipe },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Create recipe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create recipe',
    });
  }
});

// GET /api/recipes/:id - Get single recipe (protected)
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id as string },
      include: {
        recipeIngredients: {
          include: {
            ingredient: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: 'Recipe not found',
      });
    }

    // Check if user has permission to view this recipe
    // Allow if: recipe is public OR user is the creator
    if (!recipe.isPublic && recipe.createdById !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this recipe',
      });
    }

    res.json({
      success: true,
      data: { recipe },
    });
  } catch (error) {
    console.error('Get recipe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recipe',
    });
  }
});

// PATCH /api/recipes/:recipeId/ingredients/:ingredientId - Update a recipe ingredient with Walmart product
router.patch('/:recipeId/ingredients/:ingredientId', async (req: Request, res: Response) => {
  try {
    const { recipeId, ingredientId } = req.params;
    const { walmartItemId, walmartProductName } = req.body;

    // Find the recipe ingredient
    const recipeIngredient = await prisma.recipeIngredient.findFirst({
      where: {
        recipeId: recipeId as string,
        ingredientId: ingredientId as string,
      },
    });

    if (!recipeIngredient) {
      return res.status(404).json({
        success: false,
        message: 'Recipe ingredient not found',
      });
    }

    // Update the ingredient with Walmart product info
    // Keep the original name, just add the Walmart-specific fields
    const updatedIngredient = await prisma.ingredient.update({
      where: { id: ingredientId as string },
      data: {
        walmartItemId: walmartItemId || undefined,
        walmartProductName: walmartProductName || undefined,
      },
    });

    res.json({
      success: true,
      data: { ingredient: updatedIngredient },
      message: 'Ingredient updated successfully',
    });
  } catch (error) {
    console.error('Update ingredient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ingredient',
    });
  }
});

// POST /api/recipes/recommend - Get AI-powered recipe recommendations (protected)
router.post('/recommend', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { preferences, count } = recommendationSchema.parse(req.body);
    const userId = req.user!.userId;

    // Get user preferences from database if not provided
    let userPrefs = preferences;
    if (!userPrefs) {
      const dbPrefs = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      if (dbPrefs) {
        userPrefs = {
          dietaryRestrictions: dbPrefs.dietaryRestrictions,
          favoredCuisines: dbPrefs.favoredCuisines,
          allergies: dbPrefs.allergies,
          calorieTarget: dbPrefs.calorieTarget || undefined,
        };
      }
    }

    // Generate recommendations using OpenAI
    const recommendations = await generateRecipeRecommendations(userPrefs || {}, count);

    res.json({
      success: true,
      data: {
        recommendations,
        count: recommendations.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Recipe recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations',
    });
  }
});

// POST /api/recipes/:id/rate - Rate a recipe (protected)
router.post('/:id/rate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { rating, isFavorite } = ratingSchema.parse(req.body);
    const userId = req.user!.userId;
    const recipeId = req.params.id;

    // Check if recipe exists
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId as string },
    });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: 'Recipe not found',
      });
    }

    // Create or update recipe history
    const history = await prisma.recipeHistory.upsert({
      where: {
        userId_recipeId: {
          userId,
          recipeId: recipeId as string,
        },
      },
      update: {
        rating,
        isFavorite: isFavorite ?? false,
        viewedAt: new Date(),
      },
      create: {
        userId,
        recipeId: recipeId as string,
        rating,
        isFavorite: isFavorite ?? false,
      },
    });

    res.json({
      success: true,
      message: 'Recipe rated successfully',
      data: { history },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Rate recipe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate recipe',
    });
  }
});

// GET /api/recipes/favorites - Get user's favorite recipes (protected)
router.get('/user/favorites', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const favorites = await prisma.recipeHistory.findMany({
      where: {
        userId,
        isFavorite: true,
      },
      include: {
        recipe: true,
      },
      orderBy: {
        viewedAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: {
        favorites: favorites.map(f => f.recipe),
        count: favorites.length,
      },
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch favorites',
    });
  }
});

// GET /api/recipes/history - Get user's recipe history (protected)
router.get('/user/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await prisma.recipeHistory.findMany({
      where: { userId },
      include: { recipe: true },
      orderBy: { viewedAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      data: {
        history,
        count: history.length,
      },
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch history',
    });
  }
});

// POST /api/recipes/:id/use - Record recipe usage (free - tracks for analytics only)
router.post('/:id/use', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const recipeId = req.params.id as string;

    // Check if recipe exists
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: {
        id: true,
        title: true,
      },
    });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: 'Recipe not found',
      });
    }

    // Record usage for analytics (no credits charged)
    await recordRecipeUsage(userId, recipeId);

    res.json({
      success: true,
      message: 'Recipe usage recorded (free)',
      data: {
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        creditsCharged: 0,
      },
    });
  } catch (error) {
    console.error('Record recipe usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record recipe usage',
    });
  }
});

// POST /api/recipes/import-url - Import recipe from external URL (protected, charges 1 credit)
router.post('/import-url', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { url } = req.body;

    // Validate URL
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid URL is required',
      });
    }

    // Check credit balance BEFORE doing work
    const { hasEnoughCredits, getBalance } = await import('../services/credit.js');
    const hasCredits = await hasEnoughCredits(userId, 1);

    if (!hasCredits) {
      const balance = await getBalance(userId);
      return res.status(402).json({
        success: false,
        message: 'Insufficient credits',
        data: {
          required: 1,
          current: balance,
          shortfall: 1 - balance,
        },
      });
    }

    // Import recipe
    const { importRecipeFromUrl, findOrCreateIngredient } = await import('../services/urlRecipeImporter.js');

    let importResult;
    try {
      importResult = await importRecipeFromUrl(url);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to extract recipe from URL',
      });
    }

    const { recipe: parsedRecipe, extractionMethod, usedCache } = importResult;

    // Extract domain for sourceWebsite
    const urlObj = new URL(url);
    const sourceWebsite = urlObj.hostname.replace('www.', '');

    // Create ingredients and get IDs
    const rawIngredientData = await Promise.all(
      parsedRecipe.ingredients.map(async (ing, index) => {
        const ingredientId = await findOrCreateIngredient(ing.name);
        return {
          ingredientId,
          amount: parseFloat(ing.amount) || 1,
          unit: ing.unit || 'piece',
          notes: ing.notes || null,
          sortOrder: index,
        };
      })
    );

    // Deduplicate by ingredientId (merge duplicate ingredients)
    const ingredientMap = new Map<string, typeof rawIngredientData[0]>();
    for (const item of rawIngredientData) {
      const existing = ingredientMap.get(item.ingredientId);
      if (existing) {
        // Merge: sum amounts if same unit, otherwise keep first occurrence
        if (existing.unit === item.unit) {
          existing.amount += item.amount;
          existing.notes = existing.notes
            ? `${existing.notes}; ${item.notes || ''}`.trim()
            : item.notes;
        }
      } else {
        ingredientMap.set(item.ingredientId, item);
      }
    }

    const ingredientData = Array.from(ingredientMap.values());

    // Infer meal type from title
    const title = parsedRecipe.title.toLowerCase();
    const mealType: string[] = [];
    if (title.includes('breakfast') || title.includes('pancake') || title.includes('omelette')) {
      mealType.push('breakfast');
    }
    if (title.includes('lunch') || title.includes('sandwich') || title.includes('salad')) {
      mealType.push('lunch');
    }
    if (title.includes('dinner') || title.includes('roast') || title.includes('stew')) {
      mealType.push('dinner');
    }
    if (mealType.length === 0) {
      mealType.push('lunch', 'dinner'); // Default
    }

    // Create recipe in database
    const recipe = await prisma.recipe.create({
      data: {
        title: parsedRecipe.title,
        description: null, // NO DESCRIPTION - copyright protection
        instructions: parsedRecipe.instructions,
        prepTime: parsedRecipe.prepTime,
        cookTime: parsedRecipe.cookTime,
        servings: parsedRecipe.servings,
        calories: parsedRecipe.nutrition?.calories || null,
        protein: parsedRecipe.nutrition?.protein || null,
        carbs: parsedRecipe.nutrition?.carbs || null,
        fat: parsedRecipe.nutrition?.fat || null,
        imageUrl: null, // Don't copy images (copyright)
        mealType,
        createdById: userId,
        isPublic: false, // Always private
        isAiGenerated: false,
        usageCost: 0, // Free - recipe use charges disabled for competition
        isImported: true,
        sourceUrl: url,
        sourceWebsite,
        importedAt: new Date(),
        canBePublic: false, // CANNOT be made public (copyright protection)
        recipeIngredients: {
          create: ingredientData,
        },
      },
      include: {
        recipeIngredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    // Charge credit ONLY after successful import
    const { chargeCredits } = await import('../services/credit.js');
    await chargeCredits(
      userId,
      1,
      'URL_IMPORT',
      `Imported recipe from ${sourceWebsite}`,
      {
        url,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        extractionMethod,
        usedCache,
      }
    );

    // Get updated balance
    const newBalance = await getBalance(userId);

    res.json({
      success: true,
      message: usedCache
        ? 'Recipe imported from cache (1 credit)'
        : 'Recipe imported successfully (1 credit)',
      data: {
        recipe,
        extractionMethod,
        usedCache,
        balance: newBalance,
      },
    });
  } catch (error) {
    console.error('Import recipe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import recipe',
    });
  }
});

export default router;
