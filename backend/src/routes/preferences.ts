import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  mapPreferencesToAgentParams,
  detectConflicts,
  getUserActivePreferences,
  checkUserPreferenceConflicts
} from '../services/preferenceMapper.js';
import {
  PREFERENCE_LIBRARY,
  findLibraryDefinition,
  getDefaultValueForType
} from '../config/preferenceLibrary.js';

const router = Router();

// Validation schemas
const createPreferenceSchema = z.object({
  key: z.string(),
  label: z.string(),
  category: z.enum(['dietary', 'nutrition', 'budget', 'cuisine', 'lifestyle', 'restrictions']),
  value: z.any(),
  controlType: z.enum(['checkbox', 'slider', 'input', 'multiselect', 'select', 'tag-input']),
  controlConfig: z.record(z.any()).optional()
});

const updatePreferenceSchema = z.object({
  value: z.any().optional(),
  isActive: z.boolean().optional(),
  isPinned: z.boolean().optional()
});

const reorderPreferencesSchema = z.object({
  preferenceIds: z.array(z.string())
});

// GET /api/preferences - Get all user preferences
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { category, active } = req.query;

    const where: any = { userId };
    if (category) where.category = category;
    if (active !== undefined) where.isActive = active === 'true';

    const preferences = await prisma.userPreference.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { category: 'asc' },
        { sortOrder: 'asc' }
      ]
    });

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preferences'
    });
  }
});

// GET /api/preferences/library - Get all available preferences from library
router.get('/library', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      library: PREFERENCE_LIBRARY
    });
  } catch (error) {
    console.error('Error fetching preference library:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preference library'
    });
  }
});

// GET /api/preferences/conflicts - Check for conflicts in active preferences
router.get('/conflicts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const conflicts = await checkUserPreferenceConflicts(userId);

    res.json({
      success: true,
      conflicts
    });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check conflicts'
    });
  }
});

// GET /api/preferences/agent-params - Convert preferences to agent parameters
router.get('/agent-params', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const preferences = await getUserActivePreferences(userId);
    const agentParams = mapPreferencesToAgentParams(preferences);

    res.json({
      success: true,
      agentParams
    });
  } catch (error) {
    console.error('Error getting agent params:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get agent parameters'
    });
  }
});

// POST /api/preferences - Create a new preference
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = createPreferenceSchema.parse(req.body);

    // Check if preference already exists
    const existing = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId,
          key: data.key
        }
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Preference already exists'
      });
    }

    // Get the highest sortOrder for this category
    const highestSort = await prisma.userPreference.findFirst({
      where: { userId, category: data.category },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });

    const preference = await prisma.userPreference.create({
      data: {
        userId,
        key: data.key,
        label: data.label,
        category: data.category,
        value: data.value,
        controlType: data.controlType,
        controlConfig: data.controlConfig || {},
        sortOrder: (highestSort?.sortOrder || 0) + 1
      }
    });

    res.json({
      success: true,
      preference
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error creating preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create preference'
    });
  }
});

// POST /api/preferences/from-library/:key - Create preference from library definition
router.post('/from-library/:key', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { key } = req.params;

    const libraryDef = findLibraryDefinition(key as string);
    if (!libraryDef) {
      return res.status(404).json({
        success: false,
        message: 'Preference not found in library'
      });
    }

    // Check if already exists
    const existing = await prisma.userPreference.findUnique({
      where: {
        userId_key: { userId, key: key as string }
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Preference already exists'
      });
    }

    // Get the highest sortOrder for this category
    const highestSort = await prisma.userPreference.findFirst({
      where: { userId, category: libraryDef.category },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });

    const preference = await prisma.userPreference.create({
      data: {
        userId,
        key: libraryDef.key,
        label: libraryDef.label,
        category: libraryDef.category,
        value: libraryDef.defaultValue ?? getDefaultValueForType(libraryDef.controlType),
        controlType: libraryDef.controlType,
        controlConfig: {
          min: libraryDef.min,
          max: libraryDef.max,
          step: libraryDef.step,
          unit: libraryDef.unit,
          options: libraryDef.options
        },
        sortOrder: (highestSort?.sortOrder || 0) + 1
      }
    });

    res.json({
      success: true,
      preference
    });
  } catch (error) {
    console.error('Error creating preference from library:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create preference'
    });
  }
});

// PATCH /api/preferences/:id - Update a preference
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const data = updatePreferenceSchema.parse(req.body);

    const preference = await prisma.userPreference.findUnique({
      where: { id: id as string }
    });

    if (!preference || preference.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Preference not found'
      });
    }

    const updated = await prisma.userPreference.update({
      where: { id: id as string },
      data: {
        ...data,
        lastUsed: new Date(),
        timesUsed: data.isActive !== false ? { increment: 1 } : undefined
      }
    });

    res.json({
      success: true,
      preference: updated
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error updating preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preference'
    });
  }
});

// DELETE /api/preferences/:id - Delete a preference
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const preference = await prisma.userPreference.findUnique({
      where: { id: id as string }
    });

    if (!preference || preference.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Preference not found'
      });
    }

    await prisma.userPreference.delete({
      where: { id: id as string }
    });

    res.json({
      success: true,
      message: 'Preference deleted'
    });
  } catch (error) {
    console.error('Error deleting preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete preference'
    });
  }
});

// PATCH /api/preferences/reorder - Reorder preferences
router.patch('/reorder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { preferenceIds } = reorderPreferencesSchema.parse(req.body);

    // Update sortOrder for each preference
    await Promise.all(
      preferenceIds.map((id, index) =>
        prisma.userPreference.updateMany({
          where: { id, userId }, // Ensure user owns the preference
          data: { sortOrder: index }
        })
      )
    );

    res.json({
      success: true,
      message: 'Preferences reordered'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors
      });
    }

    console.error('Error reordering preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder preferences'
    });
  }
});

export default router;
