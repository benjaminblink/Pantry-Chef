import OpenAI from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { prisma } from '../index.js';
import type { Prisma } from '@prisma/client';
import { normalizeIngredientName } from '../utils/ingredientNormalizer.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Validate OpenAI API key on module load
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-proj-your-openai')) {
  console.warn('⚠️  OPENAI_API_KEY not configured - AI extraction will fail. Please set OPENAI_API_KEY in .env');
}

interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    notes?: string;
  }>;
  instructions: string[];
  prepTime: number;
  cookTime: number;
  servings: number;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

interface ImportResult {
  recipe: ParsedRecipe;
  extractionMethod: string;
  usedCache: boolean;
}

const AI_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Extract recipe data from the provided content and return ONLY valid JSON.

CRITICAL RULES:
1. DO NOT include description - set it to empty string or omit it (copyright protection)
2. Ingredient "name" must be the CLEAN base ingredient only (e.g. "onion", "chicken breast", "olive oil"). REMOVE all:
   - Preparation words (chopped, diced, sliced, minced, melted, softened, etc.)
   - Size descriptors (large, small, medium)
   - State descriptors (fresh, frozen, canned, dried)
   - Parenthetical content and weight conversions like "(45 g)"
   Move preparation/state info to the "notes" field instead.
3. Standardize units to: tsp, tbsp, cup, oz, lb, g, kg, ml, L, piece, whole, clove, pinch, dash
4. Every ingredient MUST have amount AND unit - no exceptions
5. Parse instructions into array of clear step-by-step strings
6. Extract nutrition data if available, otherwise omit

Return JSON in this exact format:
{
  "title": "Specific Recipe Name",
  "description": "",
  "ingredients": [
    {"name": "salmon fillet", "amount": "6", "unit": "oz", "notes": "skin removed"},
    {"name": "onion", "amount": "1", "unit": "piece", "notes": "chopped"},
    {"name": "olive oil", "amount": "2", "unit": "tbsp"}
  ],
  "instructions": ["Step 1 text", "Step 2 text"],
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "nutrition": {
    "calories": 350,
    "protein": 25,
    "carbs": 30,
    "fat": 12
  }
}

If you cannot extract reliable data, return: {"error": "Unable to extract recipe data"}`;

/**
 * Normalize unit variants to standard units using cached mappings
 */
async function normalizeUnit(unit: string): Promise<string> {
  const trimmed = unit.trim();

  // Check cache first
  const alias = await prisma.unitAlias.findUnique({
    where: { variantName: trimmed.toLowerCase() }
  });

  if (alias) {
    return alias.standardUnit;
  }

  // Return as-is if no mapping found
  return trimmed;
}

/**
 * Extract structured data (JSON-LD, Microdata) from HTML
 */
function extractStructuredData(html: string): any | null {
  const $ = cheerio.load(html);

  // Try JSON-LD first (most common)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonLd = JSON.parse($(jsonLdScripts[i]).html() || '{}');

      // Check if it's a Recipe type
      if (jsonLd['@type'] === 'Recipe' ||
          (Array.isArray(jsonLd['@graph']) && jsonLd['@graph'].some((item: any) => item['@type'] === 'Recipe'))) {

        // Handle @graph format
        if (Array.isArray(jsonLd['@graph'])) {
          const recipe = jsonLd['@graph'].find((item: any) => item['@type'] === 'Recipe');
          if (recipe) return recipe;
        }

        return jsonLd;
      }
    } catch (e) {
      // Invalid JSON, continue
    }
  }

  // Try microdata (less common)
  const recipeElem = $('[itemtype*="schema.org/Recipe"]');
  if (recipeElem.length > 0) {
    return { type: 'microdata', element: recipeElem.html() };
  }

  return null;
}

/**
 * Parse JSON-LD structured data into our recipe format
 */
function parseJsonLd(jsonLd: any): Partial<ParsedRecipe> {
  const recipe: Partial<ParsedRecipe> = {};

  // Title
  recipe.title = jsonLd.name || jsonLd.headline || '';

  // NO DESCRIPTION - copyright protection
  recipe.description = '';

  // Ingredients
  if (Array.isArray(jsonLd.recipeIngredient)) {
    recipe.ingredients = jsonLd.recipeIngredient.map((ing: string) => {
      // Normalize unicode fractions to ASCII
      const normalized = ing
        .replace(/\u00BC/g, '1/4').replace(/\u00BD/g, '1/2').replace(/\u00BE/g, '3/4')
        .replace(/\u2150/g, '1/7').replace(/\u2151/g, '1/9').replace(/\u2152/g, '1/10')
        .replace(/\u2153/g, '1/3').replace(/\u2154/g, '2/3')
        .replace(/\u2155/g, '1/5').replace(/\u2156/g, '2/5').replace(/\u2157/g, '3/5').replace(/\u2158/g, '4/5')
        .replace(/\u2159/g, '1/6').replace(/\u215A/g, '5/6')
        .replace(/\u215B/g, '1/8').replace(/\u215C/g, '3/8').replace(/\u215D/g, '5/8').replace(/\u215E/g, '7/8')
        .trim();

      // Extract parenthetical content as notes, strip weight conversions like (45 g)
      const notes: string[] = [];
      const withoutParens = normalized.replace(/\s*\(([^)]*)\)/g, (_match, content) => {
        const trimmedContent = content.trim();
        // Skip empty parens or pure weight conversions like "45 g", "100 ml"
        if (!trimmedContent || /^\d+\s*(g|kg|mg|oz|lb|ml|L)$/i.test(trimmedContent)) {
          return '';
        }
        notes.push(trimmedContent);
        return '';
      });

      // Known units for matching
      const unitPattern = /^([\d./\s-]+)\s*(cups?|tablespoons?|teaspoons?|tbsp|tsp|ounces?|oz|pounds?|lbs?|lb|grams?|g|kg|kilograms?|ml|milliliters?|liters?|L|pinch|dash|cloves?|pieces?|whole|cans?|packages?|bunche?s?|stalks?|sprigs?|heads?|slices?|sticks?)\s+(.+)$/i;
      const match = withoutParens.match(unitPattern);

      if (match) {
        const [, amount, unit, name] = match;
        return {
          name: name.replace(/,\s*$/, '').trim(),
          amount: amount.trim(),
          unit: unit.trim().toLowerCase(),
          ...(notes.length > 0 ? { notes: notes.join(', ') } : {})
        };
      }

      // Fallback: try to extract just a leading number
      const numMatch = withoutParens.match(/^([\d./\s-]+)\s+(.+)$/);
      if (numMatch) {
        return {
          name: numMatch[2].replace(/,\s*$/, '').trim(),
          amount: numMatch[1].trim(),
          unit: 'piece',
          ...(notes.length > 0 ? { notes: notes.join(', ') } : {})
        };
      }

      return {
        name: withoutParens.replace(/,\s*$/, '').trim() || ing.trim(),
        amount: '1',
        unit: 'piece',
        ...(notes.length > 0 ? { notes: notes.join(', ') } : {})
      };
    });
  }

  // Instructions
  if (Array.isArray(jsonLd.recipeInstructions)) {
    recipe.instructions = jsonLd.recipeInstructions.map((step: any) => {
      if (typeof step === 'string') return step;
      if (step.text) return step.text;
      if (step['@type'] === 'HowToStep' && step.text) return step.text;
      return JSON.stringify(step);
    });
  } else if (typeof jsonLd.recipeInstructions === 'string') {
    // Split by newlines or numbers
    recipe.instructions = jsonLd.recipeInstructions
      .split(/\n+|\d+\.\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }

  // Times (convert ISO 8601 duration to minutes)
  recipe.prepTime = parseDuration(jsonLd.prepTime) || 0;
  recipe.cookTime = parseDuration(jsonLd.cookTime) || parseDuration(jsonLd.totalTime) || 0;

  // Servings
  if (jsonLd.recipeYield) {
    const yieldMatch = String(jsonLd.recipeYield).match(/\d+/);
    recipe.servings = yieldMatch ? parseInt(yieldMatch[0]) : 4;
  } else {
    recipe.servings = 4;
  }

  // Nutrition
  if (jsonLd.nutrition) {
    recipe.nutrition = {
      calories: parseInt(jsonLd.nutrition.calories) || undefined,
      protein: parseFloat(jsonLd.nutrition.proteinContent) || undefined,
      carbs: parseFloat(jsonLd.nutrition.carbohydrateContent) || undefined,
      fat: parseFloat(jsonLd.nutrition.fatContent) || undefined,
    };
  }

  return recipe;
}

/**
 * Parse ISO 8601 duration to minutes
 */
function parseDuration(duration: string | undefined): number {
  if (!duration) return 0;

  // PT15M = 15 minutes, PT1H30M = 90 minutes
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (match) {
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    return hours * 60 + minutes;
  }

  return 0;
}

/**
 * Clean HTML to relevant recipe sections for AI processing
 */
function cleanHtmlForAI(html: string): string {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, .advertisement, .ads, .social-share').remove();

  // Try to find recipe-specific sections
  const recipeSelectors = [
    '[class*="recipe"]',
    '[class*="ingredient"]',
    '[class*="instruction"]',
    '[class*="direction"]',
    'article',
    'main'
  ];

  for (const selector of recipeSelectors) {
    const elem = $(selector);
    if (elem.length > 0 && elem.text().length > 200) {
      return elem.text().slice(0, 8000); // Limit to ~8k chars
    }
  }

  // Fallback: return body text
  return $('body').text().slice(0, 8000);
}

/**
 * Use AI to extract recipe from cleaned HTML/text
 */
async function extractWithAI(content: string): Promise<ParsedRecipe> {
  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-proj-your-openai')) {
    throw new Error('OpenAI API key not configured. Please contact support.');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: AI_EXTRACTION_PROMPT },
        { role: 'user', content: `Extract recipe from this content:\n\n${content}` }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const result = response.choices[0].message.content;
    if (!result) {
      throw new Error('AI returned empty response');
    }

    const parsed = JSON.parse(result);

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    // Validate required fields
    if (!parsed.title || !parsed.ingredients || !parsed.instructions) {
      throw new Error('Missing required recipe fields');
    }

    // Normalize units
    if (Array.isArray(parsed.ingredients)) {
      for (const ing of parsed.ingredients) {
        if (ing.unit) {
          ing.unit = await normalizeUnit(ing.unit);
        }
      }
    }

    return parsed as ParsedRecipe;
  } catch (error: any) {
    // Provide more specific error messages
    if (error.code === 'invalid_api_key') {
      throw new Error('OpenAI API key is invalid. Please contact support.');
    }
    if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please contact support.');
    }
    if (error.message?.includes('JSON')) {
      throw new Error('Failed to parse AI response. The recipe data may be incomplete or malformed.');
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Check if URL is already cached
 */
async function getCachedRecipe(url: string): Promise<ParsedRecipe | null> {
  const cached = await prisma.urlRecipeCache.findUnique({
    where: { url }
  });

  if (!cached || !cached.wasSuccessful) {
    return null;
  }

  // Update usage stats
  await prisma.urlRecipeCache.update({
    where: { url },
    data: {
      timesUsed: { increment: 1 },
      lastUsedAt: new Date()
    }
  });

  return cached.parsedData as unknown as ParsedRecipe;
}

/**
 * Cache extraction result
 */
async function cacheRecipe(
  url: string,
  rawData: any,
  parsedData: ParsedRecipe | null,
  extractionMethod: string,
  error?: string
) {
  await prisma.urlRecipeCache.upsert({
    where: { url },
    create: {
      url,
      rawData: (rawData || {}) as any,
      parsedData: (parsedData || {}) as any,
      extractionMethod,
      wasSuccessful: !!parsedData,
      errorMessage: error,
      timesUsed: 1,
      lastUsedAt: new Date()
    },
    update: {
      rawData: (rawData || {}) as any,
      parsedData: (parsedData || {}) as any,
      extractionMethod,
      wasSuccessful: !!parsedData,
      errorMessage: error,
      timesUsed: { increment: 1 },
      lastUsedAt: new Date()
    }
  });
}

/**
 * Main import function
 */
export async function importRecipeFromUrl(url: string): Promise<ImportResult> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error('Invalid URL format');
  }

  // Check cache first
  const cached = await getCachedRecipe(url);
  if (cached) {
    return {
      recipe: cached,
      extractionMethod: 'cache',
      usedCache: true
    };
  }

  // Fetch URL content
  let html: string;
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PantryChef/1.0; +https://pantrychef.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024, // 5MB limit
    });
    html = response.data;
  } catch (e: any) {
    const error = `Failed to fetch URL: ${e.message}`;
    await cacheRecipe(url, null, null, 'fetch-error', error);
    throw new Error(error);
  }

  // Try structured data extraction first
  const structuredData = extractStructuredData(html);

  if (structuredData && structuredData['@type'] === 'Recipe') {
    try {
      const partialRecipe = parseJsonLd(structuredData);

      // Check if we got enough data
      if (partialRecipe.title && partialRecipe.ingredients && partialRecipe.instructions) {
        // Normalize units for JSON-LD extracted ingredients
        for (const ing of partialRecipe.ingredients) {
          if (ing.unit) {
            ing.unit = await normalizeUnit(ing.unit);
          }
        }

        const recipe: ParsedRecipe = {
          title: partialRecipe.title,
          description: '',
          ingredients: partialRecipe.ingredients!,
          instructions: partialRecipe.instructions!,
          prepTime: partialRecipe.prepTime || 0,
          cookTime: partialRecipe.cookTime || 0,
          servings: partialRecipe.servings || 4,
          nutrition: partialRecipe.nutrition
        };

        await cacheRecipe(url, structuredData, recipe, 'json-ld');

        return {
          recipe,
          extractionMethod: 'json-ld',
          usedCache: false
        };
      }
    } catch (e) {
      console.error('Failed to parse JSON-LD:', e);
    }
  }

  // Fallback to AI extraction
  try {
    console.log(`📝 No structured data found for ${url}, falling back to AI extraction`);
    const cleanedHtml = cleanHtmlForAI(html);
    const recipe = await extractWithAI(cleanedHtml);

    await cacheRecipe(url, { cleaned: cleanedHtml.slice(0, 1000) }, recipe, 'ai-full');

    console.log(`✅ Successfully extracted recipe using AI: ${recipe.title}`);
    return {
      recipe,
      extractionMethod: 'ai-full',
      usedCache: false
    };
  } catch (e: any) {
    const error = `AI extraction failed: ${e.message}`;
    console.error(`❌ AI extraction error for ${url}:`, e.message);
    await cacheRecipe(url, null, null, 'ai-error', error);
    throw new Error(error);
  }
}

/**
 * Find or create ingredient by exact name match
 */
export async function findOrCreateIngredient(name: string, category?: string): Promise<string> {
  const cleanName = normalizeIngredientName(name);

  // Check if ingredient exists with normalized name
  const existing = await prisma.ingredient.findUnique({
    where: { name: cleanName }
  });

  if (existing) {
    return existing.id;
  }

  // Create new ingredient with normalized name
  const newIngredient = await prisma.ingredient.create({
    data: {
      name: cleanName,
      category: category || null
    }
  });

  return newIngredient.id;
}

/**
 * Cache a unit alias mapping
 */
export async function cacheUnitAlias(variantName: string, standardUnit: string, confidence: number = 1.0) {
  await prisma.unitAlias.upsert({
    where: { variantName: variantName.toLowerCase() },
    create: {
      variantName: variantName.toLowerCase(),
      standardUnit: standardUnit.toLowerCase(),
      conversionFactor: 1.0,
      isVerified: confidence >= 0.9,
      confidence
    },
    update: {
      // Don't update if already exists
    }
  });
}
