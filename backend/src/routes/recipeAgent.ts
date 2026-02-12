import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  generateRecipeWithAgent,
  generateBatchRecipes,
  generateRecipeVariation,
} from '../services/recipeAgent.js';

const router = express.Router();

// Validation schemas
const generateRecipeSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
});

const batchRecipesSchema = z.object({
  prompts: z.array(z.string().min(10)).min(1).max(10, 'Maximum 10 recipes at once'),
});

const variationSchema = z.object({
  recipeId: z.string(),
  variation: z.string().min(5, 'Variation description must be at least 5 characters'),
});

/**
 * POST /api/agent/recipe
 * Generate a single recipe from a prompt
 */
router.post('/recipe', authMiddleware, async (req, res) => {
  try {
    const { prompt } = generateRecipeSchema.parse(req.body);
    const userId = req.user?.id;

    const result = await generateRecipeWithAgent(prompt, userId);

    res.json({
      success: true,
      recipeId: result.recipeId,
      recipeTitle: result.recipeTitle,
      newIngredients: result.newIngredients,
      message: `Recipe created successfully${result.newIngredients.length > 0 ? ` with ${result.newIngredients.length} new ingredients` : ''}`,
    });
  } catch (error) {
    console.error('Generate recipe error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recipe',
    });
  }
});

/**
 * POST /api/agent/recipes/batch
 * Generate multiple recipes from a list of prompts
 */
router.post('/recipes/batch', authMiddleware, async (req, res) => {
  try {
    const { prompts } = batchRecipesSchema.parse(req.body);
    const userId = req.user?.id;

    const result = await generateBatchRecipes(prompts, userId);

    res.json({
      success: true,
      recipeIds: result.recipeIds,
      totalRecipes: result.recipeIds.length,
      totalNewIngredients: result.totalNewIngredients,
      message: `Generated ${result.recipeIds.length} recipes with ${result.totalNewIngredients} new ingredients`,
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recipes',
    });
  }
});

/**
 * POST /api/agent/recipe/variation
 * Generate a variation of an existing recipe
 */
router.post('/recipe/variation', authMiddleware, async (req, res) => {
  try {
    const { recipeId, variation } = variationSchema.parse(req.body);
    const userId = req.user?.id;

    const result = await generateRecipeVariation(recipeId, variation, userId);

    res.json({
      success: true,
      recipeId: result.recipeId,
      newIngredients: result.newIngredients,
      message: `Recipe variation created successfully`,
    });
  } catch (error) {
    console.error('Generate variation error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate variation',
    });
  }
});

/**
 * POST /api/agent/recipe/quick
 * Public endpoint for quick recipe generation (no auth required)
 */
router.post('/recipe/quick', async (req, res) => {
  try {
    const { prompt } = generateRecipeSchema.parse(req.body);

    const result = await generateRecipeWithAgent(prompt);

    res.json({
      success: true,
      recipeId: result.recipeId,
      recipeTitle: result.recipeTitle,
      newIngredients: result.newIngredients,
      message: 'Recipe created successfully',
    });
  } catch (error) {
    console.error('Quick generate error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recipe',
    });
  }
});

export default router;
