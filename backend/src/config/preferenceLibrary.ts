// Preference Library Configuration
// Defines all available preferences that users can enable

export interface PreferenceDefinition {
  key: string;
  label: string;
  description: string;
  category: 'dietary' | 'nutrition' | 'budget' | 'cuisine' | 'lifestyle' | 'restrictions';
  controlType: 'checkbox' | 'slider' | 'input' | 'multiselect' | 'select' | 'tag-input';
  agentParameter: string; // Maps to agent parameter name
  agentValue?: any; // For checkboxes, what value to send when checked
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  conflicts?: string[]; // Other preference keys that conflict
  warnings?: string[]; // Preferences that might have implicit effects
}

export const PREFERENCE_LIBRARY: Record<string, PreferenceDefinition[]> = {
  dietary: [
    {
      key: 'dietary_vegetarian',
      label: 'Vegetarian',
      description: 'No meat, poultry, or seafood',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'vegetarian'
    },
    {
      key: 'dietary_vegan',
      label: 'Vegan',
      description: 'No animal products including dairy and eggs',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'vegan',
      conflicts: ['dietary_vegetarian', 'dietary_pescatarian']
    },
    {
      key: 'dietary_keto',
      label: 'Keto',
      description: 'Very low carb, high fat diet',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'keto',
      warnings: ['nutrition_carbs_max']
    },
    {
      key: 'dietary_paleo',
      label: 'Paleo',
      description: 'No grains, legumes, or processed foods',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'paleo'
    },
    {
      key: 'dietary_pescatarian',
      label: 'Pescatarian',
      description: 'Vegetarian plus seafood',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'pescatarian'
    },
    {
      key: 'dietary_gluten_free',
      label: 'Gluten-Free',
      description: 'No wheat, barley, or rye',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'gluten-free'
    },
    {
      key: 'dietary_dairy_free',
      label: 'Dairy-Free',
      description: 'No milk, cheese, or dairy products',
      category: 'dietary',
      controlType: 'checkbox',
      agentParameter: 'dietaryRestrictions',
      agentValue: 'dairy-free'
    }
  ],

  nutrition: [
    {
      key: 'nutrition_daily_calories',
      label: 'Daily Calorie Target',
      description: 'Total calories per day',
      category: 'nutrition',
      controlType: 'slider',
      agentParameter: 'calorieTargetPerDay',
      defaultValue: 2000,
      min: 1200,
      max: 3500,
      step: 100,
      unit: 'cal'
    },
    {
      key: 'nutrition_protein_min',
      label: 'Minimum Protein',
      description: 'Minimum grams of protein per day',
      category: 'nutrition',
      controlType: 'slider',
      agentParameter: 'proteinTargetMin',
      defaultValue: 80,
      min: 50,
      max: 200,
      step: 10,
      unit: 'g'
    },
    {
      key: 'nutrition_carbs_max',
      label: 'Maximum Carbs',
      description: 'Maximum grams of carbs per day',
      category: 'nutrition',
      controlType: 'slider',
      agentParameter: 'carbsTargetMax',
      defaultValue: 200,
      min: 20,
      max: 300,
      step: 10,
      unit: 'g'
    },
    {
      key: 'nutrition_fat_max',
      label: 'Maximum Fat',
      description: 'Maximum grams of fat per day',
      category: 'nutrition',
      controlType: 'slider',
      agentParameter: 'fatTargetMax',
      defaultValue: 70,
      min: 20,
      max: 150,
      step: 5,
      unit: 'g'
    }
  ],

  budget: [
    {
      key: 'budget_weekly',
      label: 'Weekly Budget',
      description: 'Maximum spending per week',
      category: 'budget',
      controlType: 'slider',
      agentParameter: 'budgetWeekly',
      defaultValue: 100,
      min: 20,
      max: 200,
      step: 5,
      unit: '$'
    },
    {
      key: 'budget_per_meal',
      label: 'Per Meal Budget',
      description: 'Maximum cost per meal',
      category: 'budget',
      controlType: 'slider',
      agentParameter: 'budgetPerMeal',
      defaultValue: 10,
      min: 2,
      max: 30,
      step: 1,
      unit: '$'
    }
  ],

  cuisine: [
    {
      key: 'cuisine_preferred',
      label: 'Preferred Cuisines',
      description: 'Cuisines you enjoy',
      category: 'cuisine',
      controlType: 'multiselect',
      agentParameter: 'cuisinePreferences',
      options: [
        'Italian',
        'Mexican',
        'Asian',
        'Indian',
        'Mediterranean',
        'American',
        'French',
        'Thai',
        'Japanese',
        'Greek',
        'Chinese',
        'Korean',
        'Vietnamese'
      ]
    },
    {
      key: 'cuisine_avoided',
      label: 'Avoided Cuisines',
      description: 'Cuisines to exclude',
      category: 'cuisine',
      controlType: 'multiselect',
      agentParameter: 'cuisineExclude',
      options: [
        'Italian',
        'Mexican',
        'Asian',
        'Indian',
        'Mediterranean',
        'American',
        'French',
        'Thai',
        'Japanese',
        'Greek',
        'Chinese',
        'Korean',
        'Vietnamese'
      ]
    }
  ],

  lifestyle: [
    {
      key: 'lifestyle_days_to_plan',
      label: 'Days to Plan',
      description: 'Number of days to generate meals for',
      category: 'lifestyle',
      controlType: 'slider',
      agentParameter: 'daysToGenerate',
      defaultValue: 7,
      min: 1,
      max: 14,
      step: 1,
      unit: 'days'
    },
    {
      key: 'lifestyle_max_cook_time',
      label: 'Maximum Cook Time',
      description: 'Maximum time to spend cooking per meal',
      category: 'lifestyle',
      controlType: 'slider',
      agentParameter: 'maxCookTime',
      defaultValue: 45,
      min: 15,
      max: 120,
      step: 15,
      unit: 'min'
    },
    {
      key: 'lifestyle_family_size',
      label: 'Family Size',
      description: 'Number of people to cook for',
      category: 'lifestyle',
      controlType: 'slider',
      agentParameter: 'servings',
      defaultValue: 4,
      min: 1,
      max: 8,
      step: 1,
      unit: 'people'
    },
    {
      key: 'lifestyle_skill_level',
      label: 'Cooking Skill Level',
      description: 'Your cooking experience',
      category: 'lifestyle',
      controlType: 'select',
      agentParameter: 'skillLevel',
      defaultValue: 'Intermediate',
      options: ['Beginner', 'Intermediate', 'Advanced']
    },
    {
      key: 'lifestyle_meal_prep_friendly',
      label: 'Meal Prep Friendly',
      description: 'Recipes that can be made in advance',
      category: 'lifestyle',
      controlType: 'checkbox',
      agentParameter: 'mealPrepFriendly',
      agentValue: true
    }
  ],

  restrictions: [
    {
      key: 'restrictions_allergies',
      label: 'Allergies',
      description: 'Ingredients you are allergic to',
      category: 'restrictions',
      controlType: 'tag-input',
      agentParameter: 'allergies',
      defaultValue: []
    },
    {
      key: 'restrictions_disliked',
      label: 'Disliked Ingredients',
      description: 'Ingredients you prefer to avoid',
      category: 'restrictions',
      controlType: 'tag-input',
      agentParameter: 'dislikedIngredients',
      defaultValue: []
    }
  ]
};

// Helper to find a preference definition by key
export function findLibraryDefinition(key: string): PreferenceDefinition | null {
  for (const category of Object.values(PREFERENCE_LIBRARY)) {
    const found = category.find(def => def.key === key);
    if (found) return found;
  }
  return null;
}

// Helper to get default value for a control type
export function getDefaultValueForType(controlType: string): any {
  switch (controlType) {
    case 'checkbox':
      return false;
    case 'slider':
    case 'input':
      return 0;
    case 'multiselect':
    case 'tag-input':
      return [];
    case 'select':
      return '';
    default:
      return null;
  }
}

// Helper to get category icon
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    dietary: '🍴',
    nutrition: '🥗',
    budget: '💰',
    cuisine: '🌍',
    lifestyle: '⏱️',
    restrictions: '🚫'
  };
  return icons[category] || '📋';
}

// Helper to categorize a style name
export function categorizeStyle(styleName: string): string {
  const lowerName = styleName.toLowerCase();

  if (lowerName.includes('pot') || lowerName.includes('pan') || lowerName.includes('cooker') ||
      lowerName.includes('grill') || lowerName.includes('bake') || lowerName.includes('fry')) {
    return 'cooking_method';
  }

  if (lowerName.includes('quick') || lowerName.includes('weekend') || lowerName.includes('time')) {
    return 'timing';
  }

  if (lowerName.includes('simple') || lowerName.includes('moderate') || lowerName.includes('complex')) {
    return 'complexity';
  }

  return 'cuisine';
}

// Helper to get keywords for a style
export function getKeywordsForStyle(styleName: string): string[] {
  const keywords: Record<string, string[]> = {
    'one-pot': ['one pot', 'one-pot', 'single pot'],
    'sheet-pan': ['sheet pan', 'sheet-pan', 'baking sheet'],
    'slow-cooker': ['slow cooker', 'crockpot', 'slow-cooker'],
    'quick-weeknight': ['quick', 'easy', 'fast', 'weeknight', '30 minutes'],
    'moderate-time': ['moderate', 'hour'],
    'weekend-project': ['complex', 'elaborate', 'long', 'weekend'],
    'mediterranean': ['mediterranean', 'greek', 'olive oil'],
    'asian': ['asian', 'soy sauce', 'ginger', 'sesame'],
    'mexican': ['mexican', 'taco', 'salsa', 'tortilla'],
    'italian': ['italian', 'pasta', 'parmesan'],
    'simple': ['simple', 'easy', 'basic'],
    'moderate': ['moderate'],
    'complex': ['complex', 'advanced', 'difficult']
  };

  return keywords[styleName.toLowerCase()] || [styleName];
}
