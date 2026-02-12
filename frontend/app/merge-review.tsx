import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

interface RecipeBreakdown {
  recipeTitle: string;
  amount: number;
  unit: string;
}

interface CartItem {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
  recipes: string[];
  recipeBreakdown?: RecipeBreakdown[];
}

interface PotentialMerge {
  mergeId: string;
  ingredients: CartItem[];
  similarity: number;
  reason: string;
  suggestedName: string;
  totalAmount: number;
  unit: string;
  canonicalUnit?: string;
  conversionRatios?: number[];
  walmartItemId?: string;
  previousDecision?: 'merge' | 'keep_separate' | null;
}

interface MergeSelection {
  selectedIngredientIds: Set<string>;
  mergedName: string;
}

function calculateMergedAmount(
  merge: PotentialMerge,
  selectedIngredientIds: Set<string>,
  selectedName: string
): { amount: number; unit: string } {
  const selectedIngredient = merge.ingredients.find(
    (i) => i.ingredientName === selectedName
  );
  const targetUnit = selectedIngredient?.unit || merge.unit;

  if (!merge.canonicalUnit || !merge.conversionRatios) {
    const total = merge.ingredients
      .filter((i) => selectedIngredientIds.has(i.ingredientId))
      .reduce((sum, item) => sum + item.amount, 0);
    return { amount: total, unit: targetUnit };
  }

  let total = 0;
  merge.ingredients.forEach((ingredient, idx) => {
    if (!selectedIngredientIds.has(ingredient.ingredientId)) return;

    const canonicalRatio = merge.conversionRatios![idx];

    if (ingredient.unit === targetUnit) {
      total += ingredient.amount;
    } else if (merge.canonicalUnit === targetUnit) {
      total += ingredient.amount * canonicalRatio;
    } else {
      const inCanonical = ingredient.amount * canonicalRatio;
      const targetIngredientIdx = merge.ingredients.findIndex(
        (i) => i.ingredientName === selectedName
      );
      if (targetIngredientIdx >= 0) {
        const targetRatio = merge.conversionRatios![targetIngredientIdx];
        total += inCanonical / targetRatio;
      } else {
        total += ingredient.amount;
      }
    }
  });

  return { amount: Math.round(total * 1000) / 1000, unit: targetUnit };
}

export default function MergeReviewScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const potentialMerges: PotentialMerge[] = JSON.parse(
    (params.potentialMerges as string) || '[]'
  );
  const baseIngredients: CartItem[] = JSON.parse(
    (params.ingredients as string) || '[]'
  );
  const recipes = JSON.parse((params.recipes as string) || '[]');
  const shoppingListId = params.shoppingListId as string | undefined;

  const [mergeSelections, setMergeSelections] = useState<{
    [mergeId: string]: MergeSelection;
  }>(() => {
    const initial: { [mergeId: string]: MergeSelection } = {};
    potentialMerges.forEach((merge) => {
      const shouldPreselect = merge.previousDecision === 'merge' ||
                              (!merge.previousDecision && merge.similarity > 0.80);

      initial[merge.mergeId] = {
        selectedIngredientIds: shouldPreselect
          ? new Set(merge.ingredients.map((i) => i.ingredientId))
          : new Set(),
        mergedName: merge.suggestedName,
      };
    });
    return initial;
  });

  const [processing, setProcessing] = useState(false);

  const toggleIngredient = (mergeId: string, ingredientId: string) => {
    setMergeSelections((prev) => {
      const current = prev[mergeId];
      const newSelected = new Set(current.selectedIngredientIds);

      if (newSelected.has(ingredientId)) {
        newSelected.delete(ingredientId);
      } else {
        newSelected.add(ingredientId);
      }

      return {
        ...prev,
        [mergeId]: {
          ...current,
          selectedIngredientIds: newSelected,
        },
      };
    });
  };

  const setMergedName = (mergeId: string, name: string) => {
    setMergeSelections((prev) => ({
      ...prev,
      [mergeId]: {
        ...prev[mergeId],
        mergedName: name,
      },
    }));
  };

  const handleContinue = async () => {
    try {
      setProcessing(true);

      if (shoppingListId) {
        const mergeDecisions = potentialMerges.map((merge) => {
          const selection = mergeSelections[merge.mergeId];
          const selectedIds = selection.selectedIngredientIds;
          const decision = selectedIds.size >= 2 ? 'merge' : 'keep_separate';
          return {
            mergeId: merge.mergeId,
            decision: decision as 'merge' | 'keep_separate',
          };
        });

        const token = await AsyncStorage.getItem('authToken');
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${API_URL}/meal-plans/shopping-lists/${shoppingListId}/merge-decisions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ mergeDecisions }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to save merge decisions: ${response.status}`);
        }
      }

      const finalIngredients: CartItem[] = [...baseIngredients];

      potentialMerges.forEach((merge) => {
        const selection = mergeSelections[merge.mergeId];
        const selectedIds = selection.selectedIngredientIds;

        if (selectedIds.size >= 2) {
          const selectedIngredients = merge.ingredients.filter((i) =>
            selectedIds.has(i.ingredientId)
          );
          const unselectedIngredients = merge.ingredients.filter(
            (i) => !selectedIds.has(i.ingredientId)
          );

          const { amount, unit } = calculateMergedAmount(
            merge,
            selectedIds,
            selection.mergedName
          );

          const allRecipes = [
            ...new Set(selectedIngredients.flatMap((item) => item.recipes)),
          ];

          const allBreakdowns = selectedIngredients
            .filter((item: any) => item.recipeBreakdown)
            .flatMap((item: any) => item.recipeBreakdown);

          const merged: CartItem = {
            ingredientId: selectedIngredients[0].ingredientId,
            ingredientName: selection.mergedName,
            amount,
            unit,
            recipes: allRecipes,
            recipeBreakdown: allBreakdowns.length > 0 ? allBreakdowns : undefined,
          };

          finalIngredients.push(merged);
          finalIngredients.push(...unselectedIngredients);
        } else {
          finalIngredients.push(...merge.ingredients);
        }
      });

      const cartParams: Record<string, string> = {
        recipes: JSON.stringify(recipes),
        ingredients: JSON.stringify(finalIngredients),
      };
      if (shoppingListId) {
        cartParams.shoppingListId = shoppingListId;
      }

      router.replace({
        pathname: '/shopping-cart',
        params: cartParams,
      });
    } catch (error) {
      console.error('Error applying merges:', error);
      Alert.alert('Error', 'Failed to apply merge decisions');
    } finally {
      setProcessing(false);
    }
  };

  const handleSkip = () => {
    const allIngredients = [
      ...baseIngredients,
      ...potentialMerges.flatMap((m) => m.ingredients),
    ];

    const cartParams: Record<string, string> = {
      recipes: JSON.stringify(recipes),
      ingredients: JSON.stringify(allIngredients),
    };
    if (shoppingListId) {
      cartParams.shoppingListId = shoppingListId;
    }

    router.replace({
      pathname: '/shopping-cart',
      params: cartParams,
    });
  };

  const getConfidenceColor = (similarity: number): string => {
    if (similarity >= 0.85) return '#28a745';
    if (similarity >= 0.70) return '#ffc107';
    return '#fd7e14';
  };

  if (potentialMerges.length === 0) {
    setTimeout(() => {
      router.replace({
        pathname: '/shopping-cart',
        params: {
          recipes: JSON.stringify(recipes),
          ingredients: JSON.stringify(baseIngredients),
        },
      });
    }, 0);

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>No duplicates found...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Review {potentialMerges.length} Similar Ingredient
          {potentialMerges.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {potentialMerges.map((merge) => {
          const selection = mergeSelections[merge.mergeId];
          const selectedCount = selection.selectedIngredientIds.size;
          const canMerge = selectedCount >= 2;

          return (
            <View key={merge.mergeId} style={styles.mergeCard}>
              <View
                style={[
                  styles.confidenceBadge,
                  { backgroundColor: getConfidenceColor(merge.similarity) },
                ]}
              >
                <Text style={styles.confidencePercent}>
                  {Math.round(merge.similarity * 100)}% Match
                </Text>
              </View>

              <View style={styles.ingredientsSection}>
                <Text style={styles.sectionLabel}>
                  Select ingredients to merge:
                </Text>
                {merge.ingredients.map((ingredient) => {
                  const isSelected = selection.selectedIngredientIds.has(
                    ingredient.ingredientId
                  );

                  return (
                    <TouchableOpacity
                      key={ingredient.ingredientId}
                      style={styles.ingredientRow}
                      onPress={() =>
                        toggleIngredient(merge.mergeId, ingredient.ingredientId)
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.checkIcon}>
                        {isSelected ? '☑' : '☐'}
                      </Text>
                      <View style={styles.ingredientDetails}>
                        <Text style={styles.ingredientName}>
                          {ingredient.ingredientName}
                        </Text>
                        <Text style={styles.ingredientAmount}>
                          {ingredient.amount} {ingredient.unit}
                        </Text>
                        {ingredient.recipes.length > 0 && (
                          <Text style={styles.ingredientRecipes}>
                            Used in: {ingredient.recipes.join(', ')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {canMerge && (
                <View style={styles.mergeNameSection}>
                  <Text style={styles.sectionLabel}>Merge as:</Text>
                  <View style={styles.pickerContainer}>
                    <Picker<string>
                      selectedValue={selection.mergedName}
                      onValueChange={(value: string) =>
                        setMergedName(merge.mergeId, value)
                      }
                      style={styles.picker}
                    >
                      {merge.ingredients.map((ingredient) => (
                        <Picker.Item
                          key={ingredient.ingredientId}
                          label={ingredient.ingredientName}
                          value={ingredient.ingredientName}
                        />
                      ))}
                    </Picker>
                  </View>

                  <View style={styles.mergedPreview}>
                    <Text style={styles.mergedAmount}>
                      Total:{' '}
                      {(() => {
                        const { amount, unit } = calculateMergedAmount(
                          merge,
                          selection.selectedIngredientIds,
                          selection.mergedName
                        );
                        return `${amount} ${unit}`;
                      })()}
                    </Text>
                  </View>
                </View>
              )}

              {!canMerge && selectedCount > 0 && (
                <Text style={styles.warningText}>
                  Select at least 2 ingredients to merge
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={processing}
        >
          <Text style={styles.skipButtonText}>Keep All Separate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          disabled={processing}
        >
          <Text style={styles.continueButtonText}>
            {processing ? 'Processing...' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#34C759',
    padding: 12,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  scrollView: {
    flex: 1,
    padding: 15,
  },
  mergeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  confidenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  confidencePercent: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  ingredientsSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingVertical: 4,
  },
  checkIcon: {
    fontSize: 20,
    color: '#34C759',
    marginRight: 10,
    marginTop: 2,
  },
  ingredientDetails: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  ingredientAmount: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  ingredientRecipes: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  mergeNameSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  picker: {
    height: 50,
  },
  mergedPreview: {
    backgroundColor: '#e8f5e9',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
  },
  mergedAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  warningText: {
    fontSize: 12,
    color: '#ff9800',
    fontStyle: 'italic',
    marginTop: 8,
  },
  footer: {
    backgroundColor: 'white',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    flexDirection: 'row',
    gap: 10,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  continueButton: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: '#34C759',
    borderRadius: 8,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: 'bold',
  },
});
