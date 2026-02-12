import OpenAI from 'openai';
import { prisma } from '../index.js';
import { generateEmbedding } from './openai.js';
import type { AgentParameters } from './preferenceMapper.js';
import { normalizeIngredientName } from '../utils/ingredientNormalizer.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Infer meal type(s) from recipe title and description
 */
function inferMealType(title: string, description: string): string[] {
  const text = `${title.toLowerCase()} ${description.toLowerCase()}`;

  const breakfastKeywords = ['breakfast', 'oatmeal', 'pancake', 'waffle', 'toast', 'egg', 'omelet', 'frittata', 'smoothie', 'yogurt', 'granola', 'cereal', 'muffin', 'bagel'];
  const dinnerKeywords = ['dinner', 'stir-fry', 'stir fry', 'roasted', 'grilled', 'baked', 'seared', 'braised', 'casserole', 'stew', 'curry'];

  const mealTypes: string[] = [];

  const isBreakfast = breakfastKeywords.some(kw => text.includes(kw));
  const isDinner = dinnerKeywords.some(kw => text.includes(kw));

  if (isBreakfast) mealTypes.push('breakfast');
  if (isDinner || (!isBreakfast && !mealTypes.length)) {
    mealTypes.push('dinner', 'lunch');
  }
  if (!isBreakfast && !isDinner) {
    mealTypes.push('breakfast', 'lunch', 'dinner');
  }

  return mealTypes.length > 0 ? mealTypes : ['breakfast', 'lunch', 'dinner'];
}

const AGENT_SYSTEM_PROMPT = `You are a recipe generation assistant. Return ONLY valid JSON in this EXACT format:

{"recipe":{
  "title":"Specific Recipe Name",
  "description":"Brief description",
  "ingredients":[
    {"name":"main protein","amount":"6","unit":"oz"},
    {"name":"cooking fat","amount":"2","unit":"tbsp"},
    {"name":"seasoning","amount":"0.5","unit":"tsp"},
    {"name":"aromatics","amount":"2","unit":"clove"}
  ],
  "instructions":["Step 1","Step 2"],
  "prepTime":15,
  "cookTime":30,
  "servings":4,
  "nutrition":{"calories":350,"protein":25,"carbs":30,"fat":12}
}}

CRITICAL INGREDIENT RULES - READ CAREFULLY:
- NEVER use "or" in ingredient names (NO "protein A or protein B", NO "broth or water", NO "herb A or herb B")
- Pick ONE specific ingredient per line - be decisive and creative
- If you're tempted to use "or" for recipe variants, pick ONE option and use variant naming (see naming rules below)
- EVERY SINGLE INGREDIENT MUST HAVE A UNIT - NO EXCEPTIONS
  * NEVER leave unit empty, null, or as empty string ("")
  * Even countable items need units: use "piece", "whole", "count", "clove", "leaf", "sprig"
  * Examples: {"name":"egg","amount":"2","unit":"piece"}, {"name":"onion","amount":"1","unit":"whole"}
- Amount must be a number (can be decimal like "0.5" or "0.25")
- Standard cooking units: tsp, tbsp, cup, oz, lb, g, kg, ml, L, piece, whole, count, clove, pinch, dash, leaf, sprig
- For seasonings (salt, pepper, spices): use "tsp", "tbsp", or "pinch" - NEVER leave unit empty
- For countable items: use "piece", "whole", or specific units like "clove" for garlic, "leaf" for bay leaves

CRITICAL NAMING RULES:
- Recipe titles must be SPECIFIC and describe the EXACT dish
- Include the main protein/ingredient in the title
- BE CREATIVE AND VARY YOUR CHOICES - don't default to the same proteins repeatedly
- If you want to suggest variants (different proteins, liquids, herbs), pick ONE and use parenthetical naming:
  * For MAJOR changes (proteins, main veggies): Put specific ingredient in title
    - Examples: "Pan-Seared Duck Breast with Cherry Glaze", "Baked Cod with Herb Crust"
    - NOT "Grilled Fish" or "Protein A or Protein B"
  * For MINOR changes (broths, herbs, oils): Use parenthetical differentiator
    - Examples: "Beef Stew (Red Wine Base)", "Roasted Vegetables (Olive Oil)"
    - NOT "Stew with Wine or Beer" or "Vegetables with Oil or Butter"
- The user can request more recipes if they want variants - you should create ONE specific recipe per request

VARIETY IS KEY: Mix up proteins (beef, pork, chicken, turkey, duck, various fish, shrimp, tofu, beans, etc.), cooking methods (baking, grilling, braising, stir-frying, roasting, steaming, etc.), and cuisines (Italian, Mexican, Thai, Indian, French, Japanese, etc.).

REMEMBER: Every ingredient must have amount AND unit. No exceptions. No empty units. No "or" in ingredient names or titles.`;

const IDEA_SYSTEM_PROMPT = `Return only JSON: {"title":"Recipe Name","description":"One sentence description highlighting the key protein, cooking method, and flavor profile"}`;

const BATCH_IDEAS_SYSTEM_PROMPT = `You will generate multiple diverse recipe ideas in a single batch. Return ONLY a JSON array.

CRITICAL: Each recipe MUST be completely different from all others in the batch.
- Use DIFFERENT SPECIFIC protein sources across recipes (salmon, tuna, cod, shrimp, scallops, chicken breast, tofu, etc.)
- Use DIFFERENT cooking methods (grilled, baked, pan-seared, poached, fried, steamed, etc.)
- Use DIFFERENT cuisines (Italian, Asian, Mexican, Mediterranean, French, American, etc.)
- Use DIFFERENT flavor profiles (spicy, mild, tangy, savory, sweet, smoky, fresh, etc.)

NAMING RULES:
- Titles must be SPECIFIC and include the exact protein/main ingredient
- NEVER use "or" in titles (NOT "Grilled Salmon or Tuna", NOT "Soup with Broth or Water")
- For major variations (different proteins): use specific titles like "Grilled Salmon..." vs "Grilled Tuna..."
- For minor variations (broth type, herbs): use parenthetical like "Chicken Soup (Vegetable Broth)"

DESCRIPTION RULES:
- One sentence highlighting the key protein, cooking method, and flavor profile
- Be specific about what makes this recipe unique

Format: [{"title":"Grilled Salmon with Lemon Butter","description":"Fresh salmon grilled to perfection with tangy lemon butter sauce"},...]`;

interface RecipeIngredientInput {
  name: string;
  amount: string;
  unit: string;
  notes?: string;
}

interface RecipeInput {
  title: string;
  description: string;
  ingredients: RecipeIngredientInput[];
  instructions: string[];
  prepTime: number;
  cookTime: number;
  servings: number;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

interface AgentRecipeResponse {
  recipe: RecipeInput;
}

/**
 * Check if ingredient exists in database, return ID or null
 */
async function findIngredient(name: string): Promise<string | null> {
  const normalizedName = normalizeIngredientName(name);

  const ingredient = await prisma.ingredient.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  return ingredient?.id || null;
}

/**
 * Create a new ingredient if it doesn't exist
 */
async function createIngredientIfNeeded(
  name: string,
  category: string = 'Other'
): Promise<string> {
  const normalizedName = normalizeIngredientName(name);

  try {
    // Try to create the ingredient
    const ingredient = await prisma.ingredient.create({
      data: {
        name: normalizedName,
        category,
        caloriesPer100g: 0,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 0,
      },
    });
    return ingredient.id;
  } catch (error: any) {
    // If unique constraint failed, ingredient was created by another request
    // Fetch and return the existing ingredient
    if (error.code === 'P2002') {
      const existing = await prisma.ingredient.findFirst({
        where: {
          name: {
            equals: normalizedName,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Categorize ingredient based on name
 */
function categorizeIngredient(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('chicken') || lowerName.includes('beef') ||
      lowerName.includes('pork') || lowerName.includes('turkey') ||
      lowerName.includes('meat')) return 'Meat';

  if (lowerName.includes('fish') || lowerName.includes('salmon') ||
      lowerName.includes('tuna') || lowerName.includes('shrimp')) return 'Seafood';

  if (lowerName.includes('milk') || lowerName.includes('cheese') ||
      lowerName.includes('yogurt') || lowerName.includes('butter') ||
      lowerName.includes('cream')) return 'Dairy';

  if (lowerName.includes('lettuce') || lowerName.includes('spinach') ||
      lowerName.includes('kale') || lowerName.includes('broccoli') ||
      lowerName.includes('carrot') || lowerName.includes('pepper') ||
      lowerName.includes('onion') || lowerName.includes('tomato')) return 'Vegetables';

  if (lowerName.includes('apple') || lowerName.includes('banana') ||
      lowerName.includes('orange') || lowerName.includes('berry')) return 'Fruits';

  if (lowerName.includes('rice') || lowerName.includes('pasta') ||
      lowerName.includes('bread') || lowerName.includes('flour') ||
      lowerName.includes('oat')) return 'Grains';

  if (lowerName.includes('oil') || lowerName.includes('sauce') ||
      lowerName.includes('vinegar')) return 'Condiments';

  if (lowerName.includes('salt') || lowerName.includes('pepper') ||
      lowerName.includes('garlic') || lowerName.includes('herb') ||
      lowerName.includes('spice')) return 'Spices';

  return 'Other';
}

/**
 * Generate a recipe using AI agent
 */
export async function generateRecipeWithAgent(
  prompt: string,
  userId?: string,
  mealType?: string | string[]
): Promise<{ recipeId: string; recipeTitle: string; newIngredients: string[] }> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_completion_tokens: 8000,
      reasoning_effort: 'low' as any,
      response_format: { type: 'json_object' },
      // Note: This model only supports temperature=1 (default), custom values not allowed
    });

    console.log('OpenAI completion response:', JSON.stringify(completion, null, 2));

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.error('Empty or invalid response structure:', completion);
      throw new Error(`Empty response from AI. Finish reason: ${completion.choices[0]?.finish_reason || 'unknown'}`);
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : responseText;

    let parsed: AgentRecipeResponse;
    try {
      parsed = JSON.parse(jsonText) as AgentRecipeResponse;
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw response text:', responseText);
      console.error('Extracted JSON text:', jsonText);

      let fixedJson = jsonText
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":');

      try {
        parsed = JSON.parse(fixedJson) as AgentRecipeResponse;
        console.log('Successfully parsed after JSON cleanup');
      } catch (secondError) {
        throw new Error(`Failed to parse AI response as JSON: ${parseError}. Raw text: ${responseText.substring(0, 500)}`);
      }
    }
    const recipeData = parsed.recipe;

    const newIngredients: string[] = [];

    const ingredients = recipeData.ingredients || [];
    const description = recipeData.description || 'No description';
    const instructions = recipeData.instructions || ['No instructions yet'];
    const prepTime = recipeData.prepTime || 0;
    const cookTime = recipeData.cookTime || 0;
    const servings = recipeData.servings || 4;
    const nutrition = recipeData.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 };

    const ingredientRecords = await Promise.all(
      ingredients.map(async (ing, index) => {
        const category = categorizeIngredient(ing.name);
        const existingId = await findIngredient(ing.name);

        if (!existingId) {
          newIngredients.push(ing.name);
        }

        const ingredientId = await createIngredientIfNeeded(ing.name, category);

        let unit = ing.unit?.trim() || '';
        if (!unit) {
          console.warn(`⚠️ Missing unit for ingredient "${ing.name}" - falling back to "piece"`);
          unit = 'piece';
        }

        if (/\s+or\s+/i.test(ing.name)) {
          console.warn(`⚠️ Ingredient "${ing.name}" contains "or" - AI should not generate this`);
        }

        return {
          ingredientId,
          amount: parseFloat(ing.amount) || 1,
          unit,
          notes: ing.notes || null,
          sortOrder: index,
        };
      })
    );

    // Deduplicate by ingredientId - merge amounts if same ingredient appears multiple times
    const ingredientMap = new Map<string, typeof ingredientRecords[0]>();
    for (const record of ingredientRecords) {
      const existing = ingredientMap.get(record.ingredientId);
      if (existing) {
        console.warn(`⚠️ Duplicate ingredient detected: ${record.ingredientId} - merging amounts`);
        // Keep the first occurrence but add amounts if units match
        if (existing.unit === record.unit) {
          existing.amount += record.amount;
        } else {
          // Different units - keep first one and warn
          console.warn(`⚠️ Same ingredient with different units: ${existing.unit} vs ${record.unit} - keeping first`);
        }
      } else {
        ingredientMap.set(record.ingredientId, record);
      }
    }

    const ingredientIds = Array.from(ingredientMap.values()).map((record, index) => ({
      ...record,
      sortOrder: index, // Re-index after deduplication
    }));

    const recipeMealType = mealType
      ? (Array.isArray(mealType) ? mealType : [mealType])
      : inferMealType(recipeData.title, description);

    const recipe = await prisma.recipe.create({
      data: {
        title: recipeData.title,
        description: description,
        instructions: instructions,
        prepTime: prepTime,
        cookTime: cookTime,
        servings: servings,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        mealType: recipeMealType,
        isPublic: true,
        createdById: userId || null,
        recipeIngredients: {
          create: ingredientIds,
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

    try {
      const embeddingText = `${recipeData.title} ${description} ${ingredients.map(i => i.name).join(' ')}`;
      const embedding = await generateEmbedding(embeddingText);

      if (embedding) {
        // Convert array to pgvector format: [0.1, 0.2, ...] instead of {0.1, 0.2, ...}
        const vectorString = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE "Recipe"
          SET embedding = ${vectorString}::vector
          WHERE id = ${recipe.id}
        `;
      }
    } catch (embeddingError) {
      console.error('Failed to generate embedding, continuing without it:', embeddingError);
    }

    return {
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      newIngredients,
    };
  } catch (error) {
    console.error('Recipe agent error:', error);
    throw new Error(`Failed to generate recipe: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate recipe idea (title + description only) for preview/approval
 */
export async function generateRecipeIdea(
  prompt: string
): Promise<{ title: string; description: string }> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: IDEA_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_completion_tokens: 2000,
      reasoning_effort: 'low' as any,
    });

    const responseText = completion.choices[0]?.message?.content;

    console.log('Recipe idea generation - finish_reason:', completion.choices[0]?.finish_reason);
    console.log('Recipe idea generation - usage:', JSON.stringify(completion.usage));

    if (!responseText) {
      throw new Error('Empty response from AI');
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : responseText;
    const parsed = JSON.parse(jsonText) as { title: string; description: string };

    return parsed;
  } catch (error) {
    console.error('Recipe idea generation error:', error);
    throw new Error(`Failed to generate recipe idea: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate multiple diverse recipe ideas in a SINGLE batch call
 */
export async function generateRecipeIdeas(
  basePrompt: string,
  count: number
): Promise<Array<{ title: string; description: string; promptVariation: string }>> {
  try {
    const userPrompt = `${basePrompt}

Generate exactly ${count} diverse recipe ideas. Each recipe MUST be completely different from the others.
Ensure variety across:
- Protein sources (vary between chicken, beef, pork, fish, seafood, tofu, beans, eggs, etc. - respect any dietary restrictions mentioned above)
- Cooking methods (grilled, baked, pan-seared, poached, steamed, fried, roasted, etc.)
- Cuisines (Italian, Asian, Mexican, Mediterranean, French, American, Thai, Indian, etc.)
- Flavor profiles (spicy, mild, tangy, savory, sweet, smoky, fresh, etc.)

Return exactly ${count} recipe ideas.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: BATCH_IDEAS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 4000,
      reasoning_effort: 'low' as any,
    });

    const responseText = completion.choices[0]?.message?.content;

    console.log('Batch recipe ideas - finish_reason:', completion.choices[0]?.finish_reason);
    console.log('Batch recipe ideas - usage:', JSON.stringify(completion.usage));

    if (!responseText) {
      throw new Error('Empty response from AI');
    }

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch ? jsonMatch[0] : responseText;
    const parsed = JSON.parse(jsonText) as Array<{ title: string; description: string }>;

    return parsed.map((idea, i) => ({
      ...idea,
      promptVariation: `batch-${i}`
    }));
  } catch (error) {
    console.error('Batch recipe ideas generation error:', error);
    throw new Error(`Failed to generate recipe ideas: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate multiple recipes from a list of prompts
 */
export async function generateBatchRecipes(
  prompts: string[],
  userId?: string
): Promise<{ recipeIds: string[]; totalNewIngredients: number }> {
  const results = await Promise.all(
    prompts.map(prompt => generateRecipeWithAgent(prompt, userId))
  );

  const recipeIds = results.map(r => r.recipeId);
  const allNewIngredients = new Set(results.flatMap(r => r.newIngredients));

  return {
    recipeIds,
    totalNewIngredients: allNewIngredients.size,
  };
}

/**
 * Generate recipe variations based on existing recipe
 */
export async function generateRecipeVariation(
  recipeId: string,
  variation: string,
  userId?: string
): Promise<{ recipeId: string; newIngredients: string[] }> {
  const originalRecipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      recipeIngredients: {
        include: { ingredient: true },
      },
    },
  });

  if (!originalRecipe) {
    throw new Error('Original recipe not found');
  }

  const ingredientsList = originalRecipe.recipeIngredients
    .map(ri => `${ri.amount} ${ri.unit} ${ri.ingredient.name}`)
    .join(', ');

  const prompt = `Create a ${variation} variation of this recipe:
Title: ${originalRecipe.title}
Description: ${originalRecipe.description}
Ingredients: ${ingredientsList}
Keep the same cooking style but adapt for: ${variation}`;

  return generateRecipeWithAgent(prompt, userId);
}

/**
 * Build a style-aware prompt from agent parameters
 */
export function buildPromptFromParams(
  params: AgentParameters,
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  userStyles?: any[],
  inventory?: any[]
): string {
  const parts: string[] = [];

  if (mealType) {
    parts.push(`Create a ${mealType} recipe`);
  } else {
    parts.push('Create a recipe');
  }

  if (params.dietaryRestrictions.length > 0) {
    parts.push(`that is ${params.dietaryRestrictions.join(', ')}`);
  }

  if (params.calorieTargetPerDay) {
    const mealCalories = Math.round(params.calorieTargetPerDay / 3);
    parts.push(`with approximately ${mealCalories} calories`);
  }

  if (params.proteinTargetMin) {
    const mealProtein = Math.round(params.proteinTargetMin / 3);
    parts.push(`at least ${mealProtein}g protein`);
  }

  if (params.carbsTargetMax) {
    const mealCarbs = Math.round(params.carbsTargetMax / 3);
    parts.push(`no more than ${mealCarbs}g carbs`);
  }

  if (params.fatTargetMax) {
    const mealFat = Math.round(params.fatTargetMax / 3);
    parts.push(`no more than ${mealFat}g fat`);
  }

  if (params.maxCookTime) {
    parts.push(`that takes no more than ${params.maxCookTime} minutes to cook`);
  }

  if (params.servings) {
    parts.push(`for ${params.servings} servings`);
  }

  if (params.cuisinePreferences && params.cuisinePreferences.length > 0) {
    parts.push(`preferably ${params.cuisinePreferences.join(' or ')} cuisine`);
  }

  if (params.skillLevel) {
    parts.push(`suitable for ${params.skillLevel.toLowerCase()} skill level`);
  }

  if (params.allergies && params.allergies.length > 0) {
    parts.push(`avoiding ${params.allergies.join(', ')} (allergies)`);
  }

  if (params.dislikedIngredients && params.dislikedIngredients.length > 0) {
    parts.push(`and not using ${params.dislikedIngredients.join(', ')}`);
  }

  if (params.mealPrepFriendly) {
    parts.push('that is meal prep friendly and can be made in advance');
  }

  if (userStyles && userStyles.length > 0) {
    const topStyles = userStyles.slice(0, 3).map((us: any) => us.style.name).join(', ');
    parts.push(`matching the user's preferred cooking style: ${topStyles}`);
  }

  if (inventory && inventory.length > 0) {
    const ingredientNames = inventory.map((inv: any) => inv.ingredient.name).join(', ');
    parts.push(`Try to use these ingredients the user already has: ${ingredientNames}`);
  }

  return parts.join(' ') + '.';
}

/**
 * Generate recipes with structured agent parameters
 */
export async function generateRecipesFromParams(
  params: AgentParameters,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  count: number,
  userId: string,
  userStyles?: any[],
  inventory?: any[]
): Promise<{ recipeIds: string[]; newIngredients: string[] }> {
  const prompt = buildPromptFromParams(params, mealType, userStyles, inventory);

  const results = await Promise.all(
    Array.from({ length: count }, () => generateRecipeWithAgent(prompt, userId, mealType))
  );

  const recipeIds = results.map(r => r.recipeId);
  const allNewIngredients = [...new Set(results.flatMap(r => r.newIngredients))];

  return {
    recipeIds,
    newIngredients: allNewIngredients
  };
}

/**
 * Generate full recipes from approved ideas
 */
export async function generateRecipesFromApprovedIdeas(
  approvedIdeas: Array<{ title: string; description: string; mealType: string; promptVariation: string }>,
  params: AgentParameters,
  userId: string,
  userStyles?: any[],
  inventory?: any[]
): Promise<{ recipeIds: string[]; newIngredients: string[] }> {
  const results = await Promise.all(
    approvedIdeas.map(idea => {
      const basePrompt = buildPromptFromParams(params, idea.mealType as any, userStyles, inventory);
      const specificPrompt = `${basePrompt}\n\nCreate this specific recipe:\nTitle: ${idea.title}\nDescription: ${idea.description}\n\nGenerate the full recipe with ingredients and instructions based on this idea.`;

      return generateRecipeWithAgent(specificPrompt, userId, idea.mealType);
    })
  );

  const recipeIds = results.map(r => r.recipeId);
  const allNewIngredients = [...new Set(results.flatMap(r => r.newIngredients))];

  return {
    recipeIds,
    newIngredients: allNewIngredients
  };
}
