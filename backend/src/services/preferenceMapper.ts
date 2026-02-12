// Preference Mapper Service
// Maps user preferences to agent parameters for deterministic recipe generation

import { UserPreference } from '@prisma/client';
import { findLibraryDefinition } from '../config/preferenceLibrary.js';
import { prisma } from '../index.js';

export interface AgentParameters {
  dietaryRestrictions: string[];
  calorieTargetPerDay?: number;
  proteinTargetMin?: number;
  carbsTargetMax?: number;
  fatTargetMax?: number;
  budgetWeekly?: number;
  budgetPerMeal?: number;
  cuisinePreferences?: string[];
  cuisineExclude?: string[];
  maxCookTime?: number;
  servings?: number;
  skillLevel?: string;
  mealPrepFriendly?: boolean;
  allergies?: string[];
  dislikedIngredients?: string[];
}

export interface ConflictWarning {
  preference1: string;
  preference2: string;
  message: string;
  severity: 'warning' | 'error';
}

/**
 * Converts user preferences to agent parameters
 * This is the core of reproducibility - same preferences = same parameters
 */
export function mapPreferencesToAgentParams(
  preferences: UserPreference[]
): AgentParameters {
  const params: AgentParameters = {
    dietaryRestrictions: []
  };

  for (const pref of preferences) {
    if (!pref.isActive) continue;

    const libraryDef = findLibraryDefinition(pref.key);
    if (!libraryDef) continue;

    const paramName = libraryDef.agentParameter as keyof AgentParameters;

    switch (libraryDef.controlType) {
      case 'checkbox':
        if (pref.value === true && libraryDef.agentValue) {
          if (paramName === 'dietaryRestrictions') {
            params.dietaryRestrictions.push(libraryDef.agentValue);
          } else {
            (params as any)[paramName] = libraryDef.agentValue;
          }
        }
        break;

      case 'slider':
      case 'input':
        (params as any)[paramName] = pref.value;
        break;

      case 'multiselect':
      case 'tag-input':
        (params as any)[paramName] = pref.value;
        break;

      case 'select':
        (params as any)[paramName] = pref.value;
        break;
    }
  }

  return params;
}

/**
 * Detects conflicts between preferences
 */
export function detectConflicts(
  preferences: UserPreference[]
): ConflictWarning[] {
  const conflicts: ConflictWarning[] = [];
  const activeKeys = new Set(
    preferences.filter(p => p.isActive).map(p => p.key)
  );

  for (const pref of preferences) {
    if (!pref.isActive) continue;

    const libraryDef = findLibraryDefinition(pref.key);
    if (!libraryDef?.conflicts) continue;

    for (const conflictKey of libraryDef.conflicts) {
      if (activeKeys.has(conflictKey)) {
        const conflictDef = findLibraryDefinition(conflictKey);
        conflicts.push({
          preference1: pref.key,
          preference2: conflictKey,
          message: `${pref.label} and ${conflictDef?.label} may conflict`,
          severity: 'warning'
        });
      }
    }
  }

  return conflicts;
}

/**
 * Build a natural language prompt from agent parameters
 */
export function buildPromptFromParams(
  params: AgentParameters,
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
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

  return parts.join(' ') + '.';
}

/**
 * Get user preferences by IDs and map to agent parameters
 */
export async function getAgentParamsFromPreferenceIds(
  preferenceIds: string[]
): Promise<AgentParameters> {
  const preferences = await prisma.userPreference.findMany({
    where: {
      id: { in: preferenceIds },
      isActive: true
    }
  });

  return mapPreferencesToAgentParams(preferences);
}

/**
 * Get all active preferences for a user
 */
export async function getUserActivePreferences(
  userId: string,
  category?: string
): Promise<UserPreference[]> {
  return prisma.userPreference.findMany({
    where: {
      userId,
      isActive: true,
      ...(category && { category })
    },
    orderBy: [
      { isPinned: 'desc' },
      { category: 'asc' },
      { sortOrder: 'asc' }
    ]
  });
}

/**
 * Check for conflicts in user's active preferences
 */
export async function checkUserPreferenceConflicts(
  userId: string
): Promise<ConflictWarning[]> {
  const preferences = await getUserActivePreferences(userId);
  return detectConflicts(preferences);
}
