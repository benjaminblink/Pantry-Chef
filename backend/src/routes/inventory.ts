import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireCredits } from '../middleware/creditCheck.js';
import { chargeCredits } from '../services/credit.js';
import { suggestRecipesFromPantry } from '../services/quickCookService.js';
import OpenAI from 'openai';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Validation schemas
const addInventorySchema = z.object({
  ingredientId: z.string(),
  amount: z.string(),
  unit: z.string().optional(),
  estimatedGrams: z.number().optional(),
  expiresAt: z.string().datetime().optional()
});

const updateInventorySchema = z.object({
  amount: z.string().optional(),
  unit: z.string().optional(),
  estimatedGrams: z.number().optional(),
  isAvailable: z.boolean().optional(),
  expiresAt: z.string().datetime().optional()
});

// GET /api/inventory - Get user's current inventory
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { available } = req.query;

    const where: any = { userId };
    if (available !== undefined) {
      where.isAvailable = available === 'true';
    }

    const inventory = await prisma.userInventory.findMany({
      where,
      include: {
        ingredient: true
      },
      orderBy: {
        addedAt: 'desc'
      }
    });

    res.json({
      success: true,
      inventory
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory'
    });
  }
});

// POST /api/inventory - Add item to inventory
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = addInventorySchema.parse(req.body);

    // Check if ingredient exists
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: data.ingredientId }
    });

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: 'Ingredient not found'
      });
    }

    // Check if already in inventory
    const existing = await prisma.userInventory.findUnique({
      where: {
        userId_ingredientId: {
          userId,
          ingredientId: data.ingredientId
        }
      }
    });

    if (existing) {
      // Update existing inventory item
      const updated = await prisma.userInventory.update({
        where: {
          userId_ingredientId: {
            userId,
            ingredientId: data.ingredientId
          }
        },
        data: {
          amount: data.amount,
          unit: data.unit,
          estimatedGrams: data.estimatedGrams,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
          isAvailable: true
        },
        include: {
          ingredient: true
        }
      });

      return res.json({
        success: true,
        inventory: updated,
        message: 'Inventory item updated'
      });
    }

    // Create new inventory item
    const inventoryItem = await prisma.userInventory.create({
      data: {
        userId,
        ingredientId: data.ingredientId,
        amount: data.amount,
        unit: data.unit,
        estimatedGrams: data.estimatedGrams,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
      },
      include: {
        ingredient: true
      }
    });

    res.json({
      success: true,
      inventory: inventoryItem
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error adding inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add inventory item'
    });
  }
});

// PATCH /api/inventory/:id - Update inventory item
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const data = updateInventorySchema.parse(req.body);

    const inventoryItem = await prisma.userInventory.findUnique({
      where: { id: id as string }
    });

    if (!inventoryItem || inventoryItem.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    const updated = await prisma.userInventory.update({
      where: { id: id as string },
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
      },
      include: {
        ingredient: true
      }
    });

    res.json({
      success: true,
      inventory: updated
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error updating inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inventory item'
    });
  }
});

// DELETE /api/inventory/:id - Remove item from inventory
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const inventoryItem = await prisma.userInventory.findUnique({
      where: { id: id as string }
    });

    if (!inventoryItem || inventoryItem.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    await prisma.userInventory.delete({
      where: { id: id as string }
    });

    res.json({
      success: true,
      message: 'Inventory item removed'
    });
  } catch (error) {
    console.error('Error deleting inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete inventory item'
    });
  }
});

// DELETE /api/inventory - Clear all inventory
router.delete('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    await prisma.userInventory.deleteMany({
      where: { userId }
    });

    res.json({
      success: true,
      message: 'Inventory cleared'
    });
  } catch (error) {
    console.error('Error clearing inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear inventory'
    });
  }
});

// POST /api/inventory/scan-receipt - Scan receipt with AI vision
const scanReceiptSchema = z.object({
  imageBase64: z.string()
});

router.post('/scan-receipt', authMiddleware, requireCredits(1), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { imageBase64 } = scanReceiptSchema.parse(req.body);

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a receipt scanner. Extract grocery items from receipt images. Return only valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all grocery items from this receipt. For each item, identify:
- name: The ingredient/product name (normalized, lowercase)
- amount: The quantity purchased (as a number string, default to "1" if unclear)
- unit: The unit of measurement (cups, oz, lb, g, kg, pieces, etc. - use "pieces" if unclear)
- estimatedPrice: The price paid (optional, only if clearly visible)

Return JSON in this format:
{
  "items": [
    {"name": "chicken breast", "amount": "2", "unit": "lb", "estimatedPrice": 8.99},
    {"name": "tomatoes", "amount": "5", "unit": "pieces", "estimatedPrice": 3.50}
  ]
}`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision');
    }

    const result = JSON.parse(content);
    const items = result.items || [];

    // Charge 1 credit after successful extraction
    await chargeCredits(userId, 1, 'AI_RECEIPT_SCAN', `Scanned receipt: ${items.length} items extracted`, {
      itemsExtracted: items.length
    });

    // Get updated balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true }
    });

    res.json({
      success: true,
      items,
      balance: user?.credits || 0
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error scanning receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan receipt'
    });
  }
});

// POST /api/inventory/import-receipt-items - Batch add items from receipt scan
const importReceiptItemsSchema = z.object({
  items: z.array(z.object({
    ingredientId: z.string().optional(),
    name: z.string(),
    amount: z.string(),
    unit: z.string().optional(),
    expiresAt: z.string().datetime().optional()
  }))
});

router.post('/import-receipt-items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { items } = importReceiptItemsSchema.parse(req.body);

    let created = 0;
    let updated = 0;

    for (const item of items) {
      let ingredientId = item.ingredientId;

      // If no ingredientId provided, try to find or create ingredient
      if (!ingredientId) {
        // Search for existing ingredient by name
        const existing = await prisma.ingredient.findFirst({
          where: {
            name: {
              equals: item.name,
              mode: 'insensitive'
            }
          }
        });

        if (existing) {
          ingredientId = existing.id;
        } else {
          // Create new ingredient
          const newIngredient = await prisma.ingredient.create({
            data: {
              name: item.name.toLowerCase(),
              category: 'Other'
            }
          });
          ingredientId = newIngredient.id;
        }
      }

      // Check if already in inventory
      const existingInventory = await prisma.userInventory.findUnique({
        where: {
          userId_ingredientId: {
            userId,
            ingredientId
          }
        }
      });

      if (existingInventory) {
        // Update existing
        await prisma.userInventory.update({
          where: {
            userId_ingredientId: {
              userId,
              ingredientId
            }
          },
          data: {
            amount: item.amount,
            unit: item.unit,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            isAvailable: true
          }
        });
        updated++;
      } else {
        // Create new
        await prisma.userInventory.create({
          data: {
            userId,
            ingredientId,
            amount: item.amount,
            unit: item.unit,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined
          }
        });
        created++;
      }
    }

    res.json({
      success: true,
      created,
      updated,
      message: `Added ${created} new items, updated ${updated} existing items`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error importing receipt items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import receipt items'
    });
  }
});

// POST /api/inventory/quick-cook - Get AI recipe suggestions from pantry
const quickCookSchema = z.object({
  count: z.number().min(1).max(10).optional().default(3)
});

router.post('/quick-cook', authMiddleware, requireCredits(1), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { count } = quickCookSchema.parse(req.body);

    // Generate recipes from pantry
    const recipes = await suggestRecipesFromPantry(userId, count);

    // Charge 1 credit after successful generation
    await chargeCredits(userId, 1, 'AI_RECIPE', `Quick cook: ${recipes.length} recipes generated from pantry`, {
      recipesGenerated: recipes.length,
      pantryBased: true
    });

    // Get updated balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true }
    });

    res.json({
      success: true,
      recipes,
      balance: user?.credits || 0
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error generating quick cook recipes:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate recipes'
    });
  }
});

export default router;
