// TypeScript types for meal planning features

export interface UserPreference {
  id: string;
  userId: string;
  key: string;
  label: string;
  category: 'dietary' | 'nutrition' | 'budget' | 'cuisine' | 'lifestyle' | 'restrictions';
  value: any;
  controlType: 'checkbox' | 'slider' | 'input' | 'multiselect' | 'select' | 'tag-input';
  controlConfig?: {
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    options?: string[];
  };
  sortOrder: number;
  isActive: boolean;
  isPinned: boolean;
  timesUsed: number;
  lastUsed: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreferenceDefinition {
  key: string;
  label: string;
  description: string;
  category: 'dietary' | 'nutrition' | 'budget' | 'cuisine' | 'lifestyle' | 'restrictions';
  controlType: 'checkbox' | 'slider' | 'input' | 'multiselect' | 'select' | 'tag-input';
  agentParameter: string;
  agentValue?: any;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  conflicts?: string[];
  warnings?: string[];
}

export interface PreferenceLibrary {
  dietary: PreferenceDefinition[];
  nutrition: PreferenceDefinition[];
  budget: PreferenceDefinition[];
  cuisine: PreferenceDefinition[];
  lifestyle: PreferenceDefinition[];
  restrictions: PreferenceDefinition[];
}

export interface ConflictWarning {
  preference1: string;
  preference2: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface UserInventory {
  id: string;
  userId: string;
  ingredientId: string;
  ingredient: {
    id: string;
    name: string;
    category?: string;
  };
  amount: string;
  unit?: string;
  estimatedGrams?: number;
  isAvailable: boolean;
  expiresAt?: string;
  addedAt: string;
  updatedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  instructions: string[];
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string;
  createdById?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MealSlot {
  id: string;
  mealPlanId: string;
  recipeId?: string;
  recipe?: Recipe;
  dayOfWeek: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  date: string;
  sortOrder: number;
  notes?: string;
}

export interface MealPlan {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  mealsPerDay: number;
  calorieTargetPerDay?: number;
  budgetLimit?: number;
  dietaryRestrictions: string[];
  cuisinePreferences: string[];
  existingRecipeCount: number;
  newRecipeCount: number;
  usedInventory: boolean;
  generationParams?: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  mealSlots: MealSlot[];
  shoppingLists?: ShoppingList[];
}

export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  ingredientId: string;
  ingredient: {
    id: string;
    name: string;
    category?: string;
  };
  totalAmount: string;
  unit: string;
  walmartItemId?: string;
  estimatedPrice?: number;
  isPurchased: boolean;
}

export interface ShoppingList {
  id: string;
  mealPlanId: string;
  generatedAt: string;
  totalEstimatedCost?: number;
  items: ShoppingListItem[];
}

export interface GenerateWeekParams {
  startDate: string;
  endDate: string;
  mealsPerDay: number;
  mealTypes: ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  existingRecipeRatio: number;
  useInventory: boolean;
  inventoryIngredientIds?: string[];
  matchUserStyle: boolean;
  preferenceIds: string[];
}

export interface NutritionSummary {
  daily: Record<string, {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  weekly: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}
