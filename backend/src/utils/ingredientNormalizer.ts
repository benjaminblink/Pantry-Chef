/**
 * Ingredient name normalization utilities
 * Ensures consistent ingredient naming across recipes to enable better aggregation
 */

/**
 * Normalize an ingredient name to a standard format
 * - Lowercase
 * - Singular form
 * - Remove common adjectives and parentheticals
 * - Trim whitespace
 */
export function normalizeIngredientName(name: string): string {
  let normalized = name
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(fresh|frozen|raw|cooked|dried|canned)\b/g, '')
    .replace(/\b(wild-caught|farm-raised|organic|free-range)\b/g, '')
    .replace(/\b(large|small|medium|extra-large|jumbo)\b/g, '')
    .replace(/\b(whole|half|halved|quartered|sliced|diced|chopped|minced)\b/g, '')
    .replace(/\b(peeled|deveined|trimmed|cleaned)\b/g, '')
    .replace(/\bfillets?\b/g, 'fillet')
    .replace(/\bbreasts?\b/g, 'breast')
    .replace(/\bthighs?\b/g, 'thigh')
    .replace(/\bcloves?\b/g, 'clove')
    .replace(/\bonions?\b/g, 'onion')
    .replace(/\btomatoes?\b/g, 'tomato')
    .replace(/\bpotatoes?\b/g, 'potato')
    .replace(/\bcarrots?\b/g, 'carrot')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of ingredient names
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two ingredient names
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function calculateSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeIngredientName(name1);
  const normalized2 = normalizeIngredientName(name2);

  if (normalized1 === normalized2) {
    return 1.0;
  }

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  const similarity = 1 - distance / maxLength;

  return Math.max(0, similarity);
}

/**
 * Find the canonical (most common) name among a group of similar ingredient names
 * Used when auto-merging to pick the best display name
 */
export function getCanonicalName(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];

  const normalized = names.map(n => normalizeIngredientName(n));
  const counts = new Map<string, { count: number; original: string }>();

  names.forEach((original, i) => {
    const norm = normalized[i];
    if (counts.has(norm)) {
      counts.get(norm)!.count++;
    } else {
      counts.set(norm, { count: 1, original });
    }
  });

  let best = names[0];
  let bestCount = 0;

  for (const [_, { count, original }] of counts) {
    if (count > bestCount || (count === bestCount && original.length > best.length)) {
      best = original;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Check if two ingredient names should be auto-merged (≥95% similarity)
 */
export function shouldAutoMerge(name1: string, name2: string): boolean {
  const similarity = calculateSimilarity(name1, name2);
  return similarity >= 0.95;
}

/**
 * Check if two ingredient names should be suggested for merge (40-95% similarity)
 */
export function shouldSuggestMerge(name1: string, name2: string): boolean {
  const similarity = calculateSimilarity(name1, name2);
  return similarity >= 0.40 && similarity < 0.95;
}
