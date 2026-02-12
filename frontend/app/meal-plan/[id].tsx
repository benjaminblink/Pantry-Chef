import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMealPlan, generateShoppingList } from '../../src/api/mealPlanning';
import type { MealPlan, MealSlot } from '../../src/types/mealPlanning';

export default function MealPlanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingList, setGeneratingList] = useState(false);
  const [clearCartOnEntry, setClearCartOnEntry] = useState(true);

  useEffect(() => {
    fetchMealPlan();
  }, [id]);

  const fetchMealPlan = async () => {
    try {
      setLoading(true);
      const result = await getMealPlan(id as string);
      setMealPlan(result.mealPlan);
    } catch (error) {
      console.error('Fetch meal plan error:', error);
      Alert.alert('Error', 'Failed to load meal plan');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateShoppingList = async () => {
    if (!mealPlan) return;

    try {
      setGeneratingList(true);
      const result = await generateShoppingList(mealPlan.id);

      // Transform shopping list items to cart ingredient format
      const ingredients = (result.items || []).map((item: any) => ({
        ingredientId: item.ingredientId,
        ingredientName: item.ingredient?.name || 'Unknown',
        amount: parseFloat(item.totalAmount) || 0,
        unit: item.unit || '',
        walmartItemId: item.walmartItemId,
      }));

      // Get recipes from meal plan slots
      const recipes = mealPlan.mealSlots
        .filter(slot => slot.recipe)
        .map(slot => ({
          recipeId: slot.recipe!.id,
          recipeTitle: slot.recipe!.title,
          quantity: 1,
        }));

      // Check if there are potential merges to review
      if (result.potentialMerges && result.potentialMerges.length > 0) {
        // Navigate to merge review screen
        router.push({
          pathname: '/merge-review',
          params: {
            shoppingListId: result.shoppingListId,
            potentialMerges: JSON.stringify(result.potentialMerges),
            ingredients: JSON.stringify(ingredients),
            recipes: JSON.stringify(recipes),
            clearCart: clearCartOnEntry.toString(),
          },
        });
      } else {
        // No merges, go directly to shopping cart
        router.push({
          pathname: '/shopping-cart',
          params: {
            shoppingListId: result.shoppingListId,
            ingredients: JSON.stringify(ingredients),
            recipes: JSON.stringify(recipes),
            clearCart: clearCartOnEntry.toString(),
          },
        });
      }
    } catch (error) {
      console.error('Generate shopping list error:', error);
      Alert.alert('Error', 'Failed to generate shopping list');
    } finally {
      setGeneratingList(false);
    }
  };

  const handleRecipePress = (recipeId: string) => {
    router.push(`/recipe/${recipeId}`);
  };

  const groupSlotsByDay = (slots: MealSlot[]) => {
    const grouped: { [key: string]: MealSlot[] } = {};

    slots.forEach((slot) => {
      const date = new Date(slot.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(slot);
    });

    return grouped;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Meal Plan</Text>
          <View style={styles.placeholder} />
        </View>
        <ActivityIndicator style={styles.loader} size="large" color="#AF52DE" />
      </View>
    );
  }

  if (!mealPlan) {
    return null;
  }

  const startDate = new Date(mealPlan.startDate);
  const endDate = new Date(mealPlan.endDate);
  const groupedSlots = groupSlotsByDay(mealPlan.mealSlots);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.contentPadding}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{mealPlan.name}</Text>
            {mealPlan.isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeText}>Active</Text>
              </View>
            )}
          </View>

          <Text style={styles.dateRange}>
            {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
          </Text>

          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{mealPlan.mealSlots.length}</Text>
                <Text style={styles.statLabel}>Total Meals</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{mealPlan.existingRecipeCount}</Text>
                <Text style={styles.statLabel}>Existing</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{mealPlan.newRecipeCount}</Text>
                <Text style={styles.statLabel}>New</Text>
              </View>
            </View>

            {mealPlan.calorieTargetPerDay && (
              <View style={styles.targetRow}>
                <Text style={styles.targetLabel}>Daily Calorie Target:</Text>
                <Text style={styles.targetValue}>{mealPlan.calorieTargetPerDay} cal</Text>
              </View>
            )}
          </View>

          <View style={styles.shoppingSection}>
            <TouchableOpacity
              style={styles.shoppingButton}
              onPress={handleGenerateShoppingList}
              disabled={generatingList}
            >
              {generatingList ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={styles.shoppingButtonIcon}>🛒</Text>
                  <Text style={styles.shoppingButtonText}>Generate Shopping List</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>Clear cart upon entry</Text>
              <Switch
                value={clearCartOnEntry}
                onValueChange={setClearCartOnEntry}
                trackColor={{ false: '#ddd', true: '#34C759' }}
                thumbColor="white"
              />
            </View>
          </View>

          <View style={styles.mealsSection}>
            <Text style={styles.sectionTitle}>Meals</Text>

            {Object.entries(groupedSlots).map(([date, slots]) => (
              <View key={date} style={styles.daySection}>
                <Text style={styles.dayHeader}>{date}</Text>

                {slots
                  .sort((a, b) => {
                    const order = ['breakfast', 'lunch', 'dinner', 'snack'];
                    return order.indexOf(a.mealType) - order.indexOf(b.mealType);
                  })
                  .map((slot) => (
                    <TouchableOpacity
                      key={slot.id}
                      style={styles.mealCard}
                      onPress={() => slot.recipe && handleRecipePress(slot.recipe.id)}
                    >
                      <View style={styles.mealTypeContainer}>
                        <View style={[styles.mealTypeIcon, getMealTypeStyle(slot.mealType)]}>
                          <Text style={styles.mealTypeEmoji}>{getMealTypeEmoji(slot.mealType)}</Text>
                        </View>
                        <Text style={styles.mealType}>
                          {slot.mealType.charAt(0).toUpperCase() + slot.mealType.slice(1)}
                        </Text>
                      </View>

                      {slot.recipe ? (
                        <>
                          <Text style={styles.recipeTitle}>{slot.recipe.title}</Text>

                          {slot.recipe.description && (
                            <Text style={styles.recipeDescription} numberOfLines={2}>
                              {slot.recipe.description}
                            </Text>
                          )}

                          <View style={styles.recipeStats}>
                            {slot.recipe.prepTime && (
                              <Text style={styles.recipeStat}>
                                ⏱️ {slot.recipe.prepTime + (slot.recipe.cookTime || 0)}m
                              </Text>
                            )}
                            {slot.recipe.calories && (
                              <Text style={styles.recipeStat}>
                                🔥 {slot.recipe.calories} cal
                              </Text>
                            )}
                            {slot.recipe.servings && (
                              <Text style={styles.recipeStat}>
                                🍽️ {slot.recipe.servings} servings
                              </Text>
                            )}
                          </View>
                        </>
                      ) : (
                        <Text style={styles.noRecipe}>No recipe assigned</Text>
                      )}
                    </TouchableOpacity>
                  ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function getMealTypeEmoji(mealType: string): string {
  switch (mealType) {
    case 'breakfast':
      return '🌅';
    case 'lunch':
      return '🌞';
    case 'dinner':
      return '🌙';
    case 'snack':
      return '🍎';
    default:
      return '🍽️';
  }
}

function getMealTypeStyle(mealType: string) {
  switch (mealType) {
    case 'breakfast':
      return { backgroundColor: '#FFB800' };
    case 'lunch':
      return { backgroundColor: '#34C759' };
    case 'dinner':
      return { backgroundColor: '#AF52DE' };
    case 'snack':
      return { backgroundColor: '#FF3B30' };
    default:
      return { backgroundColor: '#007AFF' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#AF52DE',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 50,
  },
  loader: {
    marginTop: 100,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  activeBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeText: {
    fontSize: 12,
    color: 'white',
    fontWeight: 'bold',
  },
  dateRange: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  statsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#AF52DE',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  targetLabel: {
    fontSize: 14,
    color: '#666',
  },
  targetValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  shoppingSection: {
    marginBottom: 24,
  },
  shoppingButton: {
    backgroundColor: '#34C759',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  shoppingButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  shoppingButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  mealsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  daySection: {
    marginBottom: 24,
  },
  dayHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#AF52DE',
    marginBottom: 12,
  },
  mealCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mealTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  mealTypeEmoji: {
    fontSize: 16,
  },
  mealType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  recipeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  recipeDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  recipeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  recipeStat: {
    fontSize: 12,
    color: '#999',
  },
  noRecipe: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});
