import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';

const router = Router();

// Validation schema
const textEntrySchema = z.object({
  text: z.string().min(1, 'Text cannot be empty').max(500, 'Text too long'),
});

// POST /api/demo/entries - Create a new text entry
router.post('/entries', async (req: Request, res: Response) => {
  try {
    const { text } = textEntrySchema.parse(req.body);

    const entry = await prisma.textEntry.create({
      data: { text },
    });

    res.status(201).json({
      success: true,
      message: 'Entry created successfully',
      data: { entry },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Create entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create entry',
    });
  }
});

// GET /api/demo/entries - Get all text entries
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.textEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        entries,
        count: entries.length,
      },
    });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch entries',
    });
  }
});

// DELETE /api/demo/entries/:id - Delete a text entry
router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    await prisma.textEntry.delete({
      where: { id: req.params.id as string },
    });

    res.json({
      success: true,
      message: 'Entry deleted successfully',
    });
  } catch (error) {
    console.error('Delete entry error:', error);
    res.status(404).json({
      success: false,
      message: 'Entry not found',
    });
  }
});

export default router;
