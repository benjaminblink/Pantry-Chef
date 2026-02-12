// Recipe Customization Routes
// Handles user-specific ingredient substitutions and quality tier selections

import express from 'express';
import { prisma } from '../index.js';
import { findSubstitutes, classifyProductsByTier } from '../services/ingredientSubstitutionService.js';
import { searchWalmartProducts } from '../services/walmart.js';

const router = express.Router();

// Get ingredient options (substitutes + quality tiers) - no recipe required
router.get('/ingredient-options/:ingredientId', async (req, res) => {
  try {
    const { ingredientId } = req.params;
    console.log(`[ingredient-options] Request for ingredientId: ${ingredientId}`);

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      include: { groupMembership: { include: { group: { include: { members: true } } } } }
    });
    if (!ingredient) {
      console.log(`[ingredient-options] Ingredient not found: ${ingredientId}`);
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }

    console.log(`[ingredient-options] Found ingredient: ${ingredient.name}`);
    console.log(`[ingredient-options] Has group: ${!!ingredient.groupMembership}`);

    // Find all ingredients in the same group (if grouped)
    const ingredientIds = ingredient.groupMembership
      ? ingredient.groupMembership.group.members.map(m => m.ingredientId)
      : [ingredientId];

    console.log(`[ingredient-options] Checking ${ingredientIds.length} ingredient(s) for substitutes`);
    if (ingredient.groupMembership) {
      console.log(`[ingredient-options] Group members: ${ingredient.groupMembership.group.members.map(m => m.ingredientId).join(', ')}`);
    }

    // Find substitutes for this ingredient and all group members
    let allSubstitutes: any[] = [];
    const seenSubstituteIds = new Set<string>();

    for (const id of ingredientIds) {
      const subs = await findSubstitutes(id);
      console.log(`[ingredient-options] Found ${subs.length} substitutes for ingredient ID: ${id}`);
      // Deduplicate substitutes
      for (const sub of subs) {
        if (!seenSubstituteIds.has(sub.id)) {
          seenSubstituteIds.add(sub.id);
          allSubstitutes.push(sub);
        }
      }
    }

    const substitutes = allSubstitutes;
    console.log(`[ingredient-options] Total unique substitutes: ${substitutes.length}`);

    // Get Walmart products for quality tier classification
    const consumerId = process.env.WALMART_CONSUMER_ID!;
    const privateKey = process.env.WALMART_PRIVATE_KEY!;

    let qualityTiers: any[] = [];
    try {
      const walmartProducts = await searchWalmartProducts(ingredient.name, consumerId, privateKey);
      if (walmartProducts.items && walmartProducts.items.length > 0) {
        qualityTiers = classifyProductsByTier(walmartProducts.items);
        console.log(`[ingredient-options] Classified ${qualityTiers.length} quality tiers`);
      }
    } catch (error) {
      console.error('[ingredient-options] Error fetching Walmart products:', error);
    }

    res.json({
      success: true,
      data: {
        substitutes,
        qualityTiers,
      },
    });
  } catch (error) {
    console.error('[ingredient-options] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ingredient options' });
  }
});

// Get ingredient options (substitutes + quality tiers) for a specific ingredient in a recipe
router.get('/recipes/:recipeId/ingredient-options/:ingredientId', async (req, res) => {
  try {
    const { recipeId, ingredientId } = req.params;
    console.log(`[ingredient-options] Request for recipeId: ${recipeId}, ingredientId: ${ingredientId}`);

    // Verify recipe exists
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      console.log(`[ingredient-options] Recipe not found: ${recipeId}`);
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      include: { groupMembership: { include: { group: { include: { members: true } } } } }
    });
    if (!ingredient) {
      console.log(`[ingredient-options] Ingredient not found: ${ingredientId}`);
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }

    console.log(`[ingredient-options] Found ingredient: ${ingredient.name}`);
    console.log(`[ingredient-options] Has group: ${!!ingredient.groupMembership}`);

    // Find all ingredients in the same group (if grouped)
    const ingredientIds = ingredient.groupMembership
      ? ingredient.groupMembership.group.members.map(m => m.ingredientId)
      : [ingredientId];

    console.log(`[ingredient-options] Checking ${ingredientIds.length} ingredient(s) for substitutes`);
    if (ingredient.groupMembership) {
      console.log(`[ingredient-options] Group members: ${ingredient.groupMembership.group.members.map(m => m.ingredientId).join(', ')}`);
    }

    // Find substitutes for this ingredient and all group members
    let allSubstitutes: any[] = [];
    const seenSubstituteIds = new Set<string>();

    for (const id of ingredientIds) {
      const subs = await findSubstitutes(id);
      console.log(`[ingredient-options] Found ${subs.length} substitutes for ingredient ID: ${id}`);
      // Deduplicate substitutes
      for (const sub of subs) {
        if (!seenSubstituteIds.has(sub.id)) {
          seenSubstituteIds.add(sub.id);
          allSubstitutes.push(sub);
        }
      }
    }

    const substitutes = allSubstitutes;
    console.log(`[ingredient-options] Total unique substitutes: ${substitutes.length}`);

    // Get Walmart products for quality tier classification
    const consumerId = process.env.WALMART_CONSUMER_ID!;
    const privateKey = process.env.WALMART_PRIVATE_KEY!;

    let qualityTiers: any[] = [];
    try {
      const walmartProducts = await searchWalmartProducts(ingredient.name, consumerId, privateKey);
      if (walmartProducts.items && walmartProducts.items.length > 0) {
        // Classify into tiers
        qualityTiers = classifyProductsByTier(walmartProducts.items);
        console.log(`[ingredient-options] Classified ${qualityTiers.length} quality tiers`);
      }
    } catch (error) {
      console.error(`Error fetching Walmart products for ${ingredient.name}:`, error);
      // Continue without quality tiers
    }

    return res.json({
      success: true,
      data: {
        ingredient: {
          id: ingredient.id,
          name: ingredient.name,
        },
        substitutes,
        qualityTiers: qualityTiers.map((tier: any) => ({
          tier: tier.tier,
          tierLevel: tier.tierLevel,
          productCount: tier.products.length,
          avgPrice: tier.avgPrice,
          priceRange: tier.priceRange,
          // Include top 3 products from each tier
          topProducts: tier.products.slice(0, 3).map((p: any) => ({
            itemId: p.itemId,
            name: p.name,
            salePrice: p.salePrice,
            thumbnailImage: p.thumbnailImage,
            customerRating: p.customerRating,
          })),
        })),
      },
    });
  } catch (error: any) {
    console.error('Error getting ingredient options:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's saved customizations for a recipe
router.get('/recipes/:recipeId/customization', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const userId = req.headers['x-user-id'] as string; // Assuming user ID is in header

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }

    const customization = await prisma.userRecipeCustomization.findUnique({
      where: {
        userId_recipeId: {
          userId,
          recipeId,
        },
      },
    });

    if (!customization) {
      return res.json({
        success: true,
        data: {
          substitutions: [],
          qualitySelections: {},
        },
      });
    }

    return res.json({
      success: true,
      data: {
        substitutions: customization.substitutions,
        qualitySelections: customization.qualitySelections,
      },
    });
  } catch (error: any) {
    console.error('Error getting recipe customization:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Save user's customizations for a recipe
router.post('/recipes/:recipeId/customization', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }

    const { substitutions, qualitySelections } = req.body;

    // Validate input
    if (!Array.isArray(substitutions) && typeof qualitySelections !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: substitutions must be array, qualitySelections must be object',
      });
    }

    // Upsert customization
    const customization = await prisma.userRecipeCustomization.upsert({
      where: {
        userId_recipeId: {
          userId,
          recipeId,
        },
      },
      update: {
        substitutions: substitutions || [],
        qualitySelections: qualitySelections || {},
        updatedAt: new Date(),
      },
      create: {
        userId,
        recipeId,
        substitutions: substitutions || [],
        qualitySelections: qualitySelections || {},
      },
    });

    return res.json({
      success: true,
      data: customization,
    });
  } catch (error: any) {
    console.error('Error saving recipe customization:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
