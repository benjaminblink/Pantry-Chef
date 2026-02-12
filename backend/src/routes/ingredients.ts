import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';

const router = Router();

// Validation schemas
const createIngredientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  walmartItemId: z.string().optional(),
  walmartSearchTerm: z.string().optional(),
  caloriesPer100g: z.number().optional(),
  proteinPer100g: z.number().optional(),
  carbsPer100g: z.number().optional(),
  fatPer100g: z.number().optional(),
});

// GET /api/ingredients - Get all ingredients
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;

    const where: any = {};

    if (category) {
      where.category = category as string;
    }

    if (search) {
      where.name = {
        contains: search as string,
        mode: 'insensitive',
      };
    }

    const ingredients = await prisma.ingredient.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: {
        ingredients,
        count: ingredients.length,
      },
    });
  } catch (error) {
    console.error('Get ingredients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ingredients',
    });
  }
});

// GET /api/ingredients/:id - Get single ingredient
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: req.params.id as string },
      include: {
        recipeIngredients: {
          include: {
            recipe: {
              select: {
                id: true,
                title: true,
                imageUrl: true,
              },
            },
          },
          take: 10,
        },
      },
    });

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: 'Ingredient not found',
      });
    }

    res.json({
      success: true,
      data: { ingredient },
    });
  } catch (error) {
    console.error('Get ingredient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ingredient',
    });
  }
});

// POST /api/ingredients - Create ingredient
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createIngredientSchema.parse(req.body);

    // Check if ingredient already exists
    const existing = await prisma.ingredient.findUnique({
      where: { name: data.name.toLowerCase() },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ingredient already exists',
        data: { ingredient: existing },
      });
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        ...data,
        name: data.name.toLowerCase(),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Ingredient created successfully',
      data: { ingredient },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Create ingredient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ingredient',
    });
  }
});

// PUT /api/ingredients/:id - Update ingredient
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = createIngredientSchema.partial().parse(req.body);

    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id as string },
      data,
    });

    res.json({
      success: true,
      message: 'Ingredient updated successfully',
      data: { ingredient },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Update ingredient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ingredient',
    });
  }
});

// DELETE /api/ingredients/:id - Delete ingredient
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.ingredient.delete({
      where: { id: req.params.id as string },
    });

    res.json({
      success: true,
      message: 'Ingredient deleted successfully',
    });
  } catch (error) {
    console.error('Delete ingredient error:', error);
    res.status(404).json({
      success: false,
      message: 'Ingredient not found',
    });
  }
});

// POST /api/ingredients/upsert - Create or get existing ingredient
router.post('/upsert', async (req: Request, res: Response) => {
  try {
    const data = createIngredientSchema.parse(req.body);

    const ingredient = await prisma.ingredient.upsert({
      where: { name: data.name.toLowerCase() },
      update: data,
      create: {
        ...data,
        name: data.name.toLowerCase(),
      },
    });

    res.json({
      success: true,
      data: { ingredient },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Upsert ingredient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upsert ingredient',
    });
  }
});

export default router;
