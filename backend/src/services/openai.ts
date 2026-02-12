import OpenAI from 'openai';
import { prisma } from '../index.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface UserPreferences {
  dietaryRestrictions?: string[];
  favoredCuisines?: string[];
  allergies?: string[];
  calorieTarget?: number;
}

interface Recipe {
  title: string;
  description: string;
  ingredients: { name: string; amount: string; unit: string }[];
  instructions: string[];
  prepTime: number;
  cookTime: number;
  servings: number;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

/**
 * Generate recipe recommendations using OpenAI
 */
export async function generateRecipeRecommendations(
  preferences: UserPreferences,
  count: number = 5
): Promise<Recipe[]> {
  try {
    const prompt = buildRecommendationPrompt(preferences, count);

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        {
          role: 'system',
          content: 'You are a professional chef and nutritionist. Generate healthy, delicious, and practical meal prep recipes based on user preferences. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 16000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    const recipes = result.recipes || [];

    const savedRecipes = await Promise.all(
      recipes.map(async (recipe: Recipe) => {
        const embedding = await generateEmbedding(
          `${recipe.title} ${recipe.description} ${recipe.ingredients.map(i => i.name).join(' ')}`
        );

        return await prisma.recipe.create({
          data: {
            title: recipe.title,
            description: recipe.description,
            instructions: [],
            prepTime: recipe.prepTime,
            cookTime: recipe.cookTime,
            servings: recipe.servings,
            isPublic: true,
            createdById: null,
          },
        });
      })
    );

    return savedRecipes;
  } catch (error) {
    console.error('OpenAI recommendation error:', error);
    throw new Error('Failed to generate recipe recommendations');
  }
}

/**
 * Generate embedding for semantic search using text-embedding-3-small
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });

    return response.data[0]?.embedding || null;
  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

/**
 * Build recommendation prompt from user preferences
 */
function buildRecommendationPrompt(
  preferences: UserPreferences,
  count: number
): string {
  const parts: string[] = [
    `Generate ${count} meal prep recipes with the following criteria:`,
  ];

  if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
    parts.push(`- Dietary restrictions: ${preferences.dietaryRestrictions.join(', ')}`);
  }

  if (preferences.favoredCuisines && preferences.favoredCuisines.length > 0) {
    parts.push(`- Preferred cuisines: ${preferences.favoredCuisines.join(', ')}`);
  }

  if (preferences.allergies && preferences.allergies.length > 0) {
    parts.push(`- Allergies to avoid: ${preferences.allergies.join(', ')}`);
  }

  if (preferences.calorieTarget) {
    parts.push(`- Target calories per serving: around ${preferences.calorieTarget}`);
  }

  parts.push(`
Return the recipes in the following JSON format:
{
  "recipes": [
    {
      "title": "Recipe Name",
      "description": "Brief description",
      "ingredients": [
        { "name": "ingredient name", "amount": "1", "unit": "cup" }
      ],
      "instructions": ["Step 1", "Step 2"],
      "prepTime": 15,
      "cookTime": 30,
      "servings": 4,
      "nutrition": {
        "calories": 350,
        "protein": 25,
        "carbs": 40,
        "fat": 10
      }
    }
  ]
}

Make the recipes:
- Practical for meal prep (can be made in batches and stored)
- Healthy and balanced
- Easy to follow with common ingredients
- Include accurate nutritional information
`);

  return parts.join('\n');
}

/**
 * Search recipes using semantic search with pgvector
 */
export async function searchRecipesBySimilarity(
  query: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    const recipes = await prisma.$queryRaw`
      SELECT
        id,
        title,
        description,
        ingredients,
        instructions,
        "prepTime",
        "cookTime",
        servings,
        nutrition,
        "imageUrl",
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) as similarity
      FROM "Recipe"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
      LIMIT ${limit}
    `;

    return recipes as any[];
  } catch (error) {
    console.error('Semantic search error:', error);
    throw new Error('Failed to search recipes');
  }
}

interface AIPromptOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  model?: string;
  jsonMode?: boolean;
}

/**
 * Generic AI prompt executor - reusable across different prompts
 */
export async function executeAIPrompt(options: AIPromptOptions): Promise<string> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens,
    model = 'gpt-5-nano-2025-08-07',
    jsonMode = false,
  } = options;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return content.trim();
  } catch (error) {
    console.error('AI prompt execution error:', error);
    throw error;
  }
}
