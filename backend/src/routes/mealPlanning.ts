import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import { mapPreferencesToAgentParams, getUserActivePreferences } from '../services/preferenceMapper.js';
import { selectExistingRecipes } from '../services/recipeSelector.js';
import { generateRecipesFromParams, generateRecipeIdeas, buildPromptFromParams, generateRecipesFromApprovedIdeas } from '../services/recipeAgent.js';
import { learnUserRecipeStyles, getUserTopStyles } from '../services/recipeStyleLearner.js';
import { generateShoppingList, getShoppingList, markItemPurchased, saveMergeDecision } from '../services/shoppingListAggregator.js';
import { chargeCredits, hasEnoughCredits } from '../services/credit.js';
import { differenceInDays, addDays } from 'date-fns';
import { deductPantryIngredients } from '../services/pantryDeductionService.js';

const router = Router();

// Validation schemas
const generateWeekSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  mealsPerDay: z.number().int().min(1).max(6).default(3),
  mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])).default(['breakfast', 'lunch', 'dinner']),
  existingRecipeRatio: z.number().min(0).max(1).default(0.4), // 40% existing, 60% new
  useInventory: z.boolean().default(false),
  inventoryIngredientIds: z.array(z.string()).optional(),
  matchUserStyle: z.boolean().default(true),
  preferenceIds: z.array(z.string()).default([]),
  approvedIdeas: z.array(z.object({
    title: z.string(),
    description: z.string(),
    mealType: z.string(),
    promptVariation: z.string()
  })).optional()
});

const updateSlotSchema = z.object({
  recipeId: z.string().optional(),
  notes: z.string().optional()
});

const markPurchasedSchema = z.object({
  isPurchased: z.boolean(),
  actualPrice: z.number().optional()
});

// POST /api/meal-plans/generate-ideas - Generate recipe ideas for review (Step 1)
router.post('/generate-ideas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = generateWeekSchema.parse(req.body);

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    // Calculate total meals needed
    const days = differenceInDays(endDate, startDate) + 1;
    const totalMeals = days * data.mealTypes.length;
    const existingCount = Math.round(totalMeals * data.existingRecipeRatio);
    const newCount = totalMeals - existingCount;

    console.log(`Generating ${newCount} recipe ideas for ${days} days (${data.mealTypes.length} meals/day)`);

    // Get user preferences
    const preferences = await getUserActivePreferences(userId);
    const agentParams = mapPreferencesToAgentParams(preferences);

    // Get user inventory if needed
    const inventory = data.useInventory && data.inventoryIngredientIds
      ? await prisma.userInventory.findMany({
          where: {
            userId,
            id: { in: data.inventoryIngredientIds }
          },
          include: { ingredient: true }
        })
      : [];

    // Get user styles
    const userStyles = data.matchUserStyle
      ? await getUserTopStyles(userId, 5)
      : [];

    // Generate recipe ideas for each meal type
    const ideas: any[] = [];
    for (const mealType of data.mealTypes) {
      const mealsOfType = Math.ceil(newCount / data.mealTypes.length);
      const basePrompt = buildPromptFromParams(agentParams, mealType, userStyles, inventory);

      const mealIdeas = await generateRecipeIdeas(basePrompt, mealsOfType);
      ideas.push(...mealIdeas.map(idea => ({
        ...idea,
        mealType
      })));
    }

    res.json({
      success: true,
      ideas: ideas.slice(0, newCount), // Trim to exact count needed
      existingRecipeCount: existingCount,
      newRecipeCount: newCount
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error generating recipe ideas:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recipe ideas',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/meal-plans/generate-week - Generate complete weekly meal plan
router.post('/generate-week', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = generateWeekSchema.parse(req.body);

    // Check and charge 1 credit for meal plan generation
    const canAfford = await hasEnoughCredits(userId, 1);
    if (!canAfford) {
      return res.status(402).json({
        success: false,
        message: 'Insufficient credits',
        error: 'INSUFFICIENT_CREDITS',
        required: 1,
      });
    }
    await chargeCredits(userId, 1, 'AI_MEAL_PLAN', 'Generated weekly meal plan');

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    // Calculate total meals needed
    const days = differenceInDays(endDate, startDate) + 1;
    const totalMeals = days * data.mealTypes.length;
    const existingCount = Math.round(totalMeals * data.existingRecipeRatio);
    const newCount = totalMeals - existingCount;

    console.log(`📊 Meal Plan Calculation:
      - Total meals: ${totalMeals} (${days} days × ${data.mealTypes.length} meals/day)
      - Existing recipe ratio: ${data.existingRecipeRatio} (${(data.existingRecipeRatio * 100).toFixed(0)}%)
      - Existing recipes to select: ${existingCount}
      - New recipes to generate: ${newCount}`);

    // Get user's inventory if needed
    let inventory: any[] = [];
    if (data.useInventory) {
      inventory = await prisma.userInventory.findMany({
        where: {
          userId,
          isAvailable: true,
          ...(data.inventoryIngredientIds && {
            ingredientId: { in: data.inventoryIngredientIds }
          })
        },
        include: { ingredient: true }
      });
    }

    // Get or learn user's style preferences
    let userStyles: any[] = [];
    if (data.matchUserStyle) {
      userStyles = await getUserTopStyles(userId, 5);

      // If no styles learned yet, learn them now
      if (userStyles.length === 0) {
        console.log('Learning user styles for the first time...');
        userStyles = await learnUserRecipeStyles(userId);
      }
    }

    // Get user preferences
    let preferences: any[] = [];
    if (data.preferenceIds.length > 0) {
      preferences = await prisma.userPreference.findMany({
        where: {
          id: { in: data.preferenceIds },
          isActive: true
        }
      });
    } else {
      // Use all active preferences
      preferences = await getUserActivePreferences(userId);
    }

    const agentParams = mapPreferencesToAgentParams(preferences);

    // Select existing recipes - distribute across meal types
    let existingRecipes: any[] = [];
    if (existingCount > 0) {
      console.log('Selecting existing recipes...');

      // Distribute existing recipes across meal types
      const recipesPerMealType = Math.ceil(existingCount / data.mealTypes.length);

      for (const mealType of data.mealTypes as any[]) {
        const count = Math.min(recipesPerMealType, existingCount - existingRecipes.length);
        if (count <= 0) break;

        const recipes = await selectExistingRecipes({
          userId,
          count,
          preferences: agentParams,
          userStyles,
          inventory,
          excludeRecentlyUsed: true,
          mealType
        });

        existingRecipes.push(...recipes);
        console.log(`  Selected ${recipes.length} existing ${mealType} recipes`);
      }

      console.log(`Selected ${existingRecipes.length} total existing recipes`);
    }

    // Generate new recipes
    let newRecipeIds: string[] = [];
    let allNewIngredients: string[] = [];

    if (newCount > 0) {
      console.log('Generating new recipes...');

      // Check if we have approved ideas to use
      if (data.approvedIdeas && data.approvedIdeas.length > 0) {
        console.log(`Using ${data.approvedIdeas.length} approved recipe ideas`);

        const result = await generateRecipesFromApprovedIdeas(
          data.approvedIdeas,
          agentParams,
          userId,
          userStyles,
          inventory
        );

        newRecipeIds.push(...result.recipeIds);
        allNewIngredients.push(...result.newIngredients);

        console.log(`Generated ${newRecipeIds.length} recipes from approved ideas`);
      } else {
        // No approved ideas - generate from scratch (old behavior)
        console.log('No approved ideas - generating new recipes from scratch');

        // Distribute new recipes across meal types
        const recipesPerMealType = Math.ceil(newCount / data.mealTypes.length);

        for (const mealType of data.mealTypes as any[]) {
          const count = Math.min(recipesPerMealType, newCount - newRecipeIds.length);
          if (count <= 0) break;

          const result = await generateRecipesFromParams(
            agentParams,
            mealType,
            count,
            userId,
            userStyles,
            inventory
          );

          newRecipeIds.push(...result.recipeIds);
          allNewIngredients.push(...result.newIngredients);
        }

        console.log(`Generated ${newRecipeIds.length} new recipes`);
      }
    }

    // Combine all recipes
    const allRecipeIds = [
      ...existingRecipes.map(r => r.id),
      ...newRecipeIds
    ];

    // Create meal plan
    const mealPlan = await prisma.mealPlan.create({
      data: {
        userId,
        name: `Week of ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        startDate,
        endDate,
        mealsPerDay: data.mealTypes.length,
        calorieTargetPerDay: agentParams.calorieTargetPerDay,
        budgetLimit: agentParams.budgetWeekly,
        dietaryRestrictions: agentParams.dietaryRestrictions,
        cuisinePreferences: agentParams.cuisinePreferences || [],
        existingRecipeCount: existingRecipes.length,
        newRecipeCount: newRecipeIds.length,
        usedInventory: data.useInventory,
        generationParams: data as any
      }
    });

    // Create meal slots
    const slots: any[] = [];
    let recipeIndex = 0;

    for (let day = 0; day < days; day++) {
      const date = addDays(startDate, day);
      const dayOfWeek = date.getDay();

      for (let mealIndex = 0; mealIndex < data.mealTypes.length; mealIndex++) {
        const mealType = data.mealTypes[mealIndex];
        const recipeId = allRecipeIds[recipeIndex % allRecipeIds.length];

        slots.push({
          mealPlanId: mealPlan.id,
          recipeId,
          dayOfWeek,
          mealType,
          date,
          sortOrder: mealIndex
        });

        recipeIndex++;
      }
    }

    await prisma.mealSlot.createMany({ data: slots });

    // Fetch complete meal plan with recipes
    const completeMealPlan = await prisma.mealPlan.findUnique({
      where: { id: mealPlan.id },
      include: {
        mealSlots: {
          include: {
            recipe: {
              include: {
                recipeIngredients: {
                  include: { ingredient: true }
                }
              }
            }
          },
          orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }]
        }
      }
    });

    res.json({
      success: true,
      mealPlan: completeMealPlan,
      usedRecipes: existingRecipes.length,
      newRecipes: newRecipeIds.length,
      newIngredients: [...new Set(allNewIngredients)],
      inventoryUsed: inventory.length
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error generating meal plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meal plan',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/meal-plans - List user's meal plans
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { active, limit = 20, offset = 0 } = req.query;

    const where: any = { userId };
    if (active !== undefined) {
      where.isActive = active === 'true';
    }

    const mealPlans = await prisma.mealPlan.findMany({
      where,
      include: {
        mealSlots: {
          include: {
            recipe: {
              select: {
                id: true,
                title: true,
                imageUrl: true,
                calories: true
              }
            }
          }
        },
        _count: {
          select: { mealSlots: true, shoppingLists: true }
        }
      },
      orderBy: { startDate: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({
      success: true,
      mealPlans
    });
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meal plans'
    });
  }
});

// GET /api/meal-plans/:id - Get specific meal plan
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: id as string },
      include: {
        mealSlots: {
          include: {
            recipe: {
              include: {
                recipeIngredients: {
                  include: { ingredient: true }
                }
              }
            }
          },
          orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }]
        },
        shoppingLists: {
          include: {
            items: {
              include: { ingredient: true }
            }
          }
        }
      }
    });

    if (!mealPlan || mealPlan.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found'
      });
    }

    // Calculate nutrition totals
    const dailyNutrition: Record<string, any> = {};
    let weeklyCalories = 0;
    let weeklyProtein = 0;
    let weeklyCarbs = 0;
    let weeklyFat = 0;

    for (const slot of mealPlan.mealSlots) {
      if (!slot.recipe) continue;

      const dateKey = slot.date.toISOString().split('T')[0];
      if (!dailyNutrition[dateKey]) {
        dailyNutrition[dateKey] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      }

      dailyNutrition[dateKey].calories += slot.recipe.calories || 0;
      dailyNutrition[dateKey].protein += slot.recipe.protein || 0;
      dailyNutrition[dateKey].carbs += slot.recipe.carbs || 0;
      dailyNutrition[dateKey].fat += slot.recipe.fat || 0;

      weeklyCalories += slot.recipe.calories || 0;
      weeklyProtein += slot.recipe.protein || 0;
      weeklyCarbs += slot.recipe.carbs || 0;
      weeklyFat += slot.recipe.fat || 0;
    }

    res.json({
      success: true,
      mealPlan,
      nutrition: {
        daily: dailyNutrition,
        weekly: {
          calories: weeklyCalories,
          protein: weeklyProtein,
          carbs: weeklyCarbs,
          fat: weeklyFat
        }
      }
    });
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meal plan'
    });
  }
});

// PATCH /api/meal-plans/:id/slots/:slotId - Update meal slot
router.patch('/:id/slots/:slotId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id, slotId } = req.params;
    const data = updateSlotSchema.parse(req.body);

    // Verify ownership
    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: id as string }
    });

    if (!mealPlan || mealPlan.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found'
      });
    }

    const slot = await prisma.mealSlot.update({
      where: { id: slotId as string },
      data,
      include: {
        recipe: {
          include: {
            recipeIngredients: {
              include: { ingredient: true }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      slot
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error updating meal slot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update meal slot'
    });
  }
});

// DELETE /api/meal-plans/:id - Delete meal plan
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: id as string }
    });

    if (!mealPlan || mealPlan.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found'
      });
    }

    await prisma.mealPlan.delete({
      where: { id: id as string }
    });

    res.json({
      success: true,
      message: 'Meal plan deleted'
    });
  } catch (error) {
    console.error('Error deleting meal plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete meal plan'
    });
  }
});

// POST /api/meal-plans/:id/shopping-list - Generate shopping list
router.post('/:id/shopping-list', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const excludePantry = req.query.excludePantry === 'true';
    const { clearCart = true } = req.body;

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: id as string }
    });

    if (!mealPlan || mealPlan.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found'
      });
    }

    const result = await generateShoppingList(id as string, excludePantry, clearCart);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error generating shopping list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate shopping list',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/shopping-lists/:id - Get shopping list
router.get('/shopping-lists/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await getShoppingList(id as string);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching shopping list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shopping list'
    });
  }
});

// PATCH /api/shopping-lists/:id/items/:itemId - Mark item as purchased
router.patch('/shopping-lists/:id/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const data = markPurchasedSchema.parse(req.body);

    await markItemPurchased(itemId as string, data.isPurchased, data.actualPrice);

    res.json({
      success: true,
      message: 'Item updated'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error updating shopping list item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item'
    });
  }
});

// POST /api/shopping-lists/:id/merge-decisions - Save merge decisions
router.post('/shopping-lists/:id/merge-decisions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mergeDecisions } = req.body as {
      mergeDecisions: { mergeId: string; decision: 'merge' | 'keep_separate' }[]
    };

    if (!mergeDecisions || !Array.isArray(mergeDecisions)) {
      return res.status(400).json({
        success: false,
        message: 'mergeDecisions array is required'
      });
    }

    // Save each merge decision
    for (const { mergeId, decision } of mergeDecisions) {
      await saveMergeDecision(id as string, mergeId, decision);
    }

    res.json({
      success: true,
      message: `Saved ${mergeDecisions.length} merge decision(s)`
    });
  } catch (error) {
    console.error('Error saving merge decisions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save merge decisions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/meal-plans/:id/complete - Mark meals as completed and deduct from pantry
const completeMealSchema = z.object({
  completedMealSlotIds: z.array(z.string())
});

router.post('/:id/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { completedMealSlotIds } = completeMealSchema.parse(req.body);

    // 1. Verify meal plan belongs to user
    const mealPlan = await prisma.mealPlan.findFirst({
      where: {
        id: id as string,
        userId
      }
    });

    if (!mealPlan) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found'
      });
    }

    // 2. Get meal slots with recipes
    const mealSlots = await prisma.mealSlot.findMany({
      where: {
        id: { in: completedMealSlotIds },
        mealPlanId: id as string
      },
      include: {
        recipe: {
          include: {
            recipeIngredients: {
              include: {
                ingredient: true
              }
            }
          }
        }
      }
    });

    if (mealSlots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid meal slots found'
      });
    }

    // 3. Mark slots as completed
    await prisma.mealSlot.updateMany({
      where: {
        id: { in: completedMealSlotIds }
      },
      data: {
        isCompleted: true,
        completedAt: new Date()
      }
    });

    // 4. Create cooking events for each completed meal
    const cookingEventsToCreate = mealSlots
      .filter(slot => slot.recipe)
      .map(slot => ({
        userId,
        recipeId: slot.recipeId!,
        mealPlanId: id as string,
        mealSlotId: slot.id,
        cookedAt: new Date(),
        pantryDeducted: true // Will be deducted in next step
      }));

    if (cookingEventsToCreate.length > 0) {
      await prisma.cookingEvent.createMany({
        data: cookingEventsToCreate
      });
    }

    // 5. Deduct ingredients from pantry
    const recipes = mealSlots
      .filter(slot => slot.recipe)
      .map(slot => slot.recipe!);

    const deductedItems = recipes.length > 0
      ? await deductPantryIngredients(userId, recipes)
      : [];

    // 6. Get updated meal plan
    const updatedMealPlan = await prisma.mealPlan.findUnique({
      where: { id: id as string },
      include: {
        mealSlots: {
          include: {
            recipe: true
          },
          orderBy: {
            date: 'asc'
          }
        }
      }
    });

    res.json({
      success: true,
      mealPlan: updatedMealPlan,
      deductedItems,
      message: `Marked ${mealSlots.length} meal(s) as completed${deductedItems.length > 0 ? `, deducted ${deductedItems.length} ingredient(s) from pantry` : ''}`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error completing meals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete meals',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/meal-plans/:id/skip - Mark meals as skipped (didn't cook)
const skipSlotsSchema = z.object({
  slotIds: z.array(z.string())
});

router.post('/:id/skip', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { slotIds } = skipSlotsSchema.parse(req.body);

    // 1. Verify meal plan belongs to user
    const mealPlan = await prisma.mealPlan.findFirst({
      where: {
        id: id as string,
        userId
      }
    });

    if (!mealPlan) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found'
      });
    }

    // 2. Verify slots belong to this meal plan
    const mealSlots = await prisma.mealSlot.findMany({
      where: {
        id: { in: slotIds },
        mealPlanId: id as string
      }
    });

    if (mealSlots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid meal slots found'
      });
    }

    // 3. Mark slots as skipped (preserves the meal plan for future reference)
    await prisma.mealSlot.updateMany({
      where: {
        id: { in: slotIds },
        mealPlanId: id as string
      },
      data: {
        isSkipped: true,
        skippedAt: new Date()
      }
    });

    // 4. Get updated meal plan
    const updatedMealPlan = await prisma.mealPlan.findUnique({
      where: { id: id as string },
      include: {
        mealSlots: {
          include: {
            recipe: true
          },
          orderBy: {
            date: 'asc'
          }
        }
      }
    });

    res.json({
      success: true,
      mealPlan: updatedMealPlan,
      skippedCount: mealSlots.length,
      message: `Marked ${mealSlots.length} meal(s) as skipped`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error skipping meal slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to skip meal slots',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
