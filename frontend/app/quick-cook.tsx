import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { quickCook, QuickCookRecipe } from '../src/api/inventory';
import { useCredits } from '../contexts/CreditContext';
import { useProFeature } from '../hooks/useProFeature';

export default function QuickCookScreen() {
  const { checkProAccess } = useProFeature();
  const { balance, refreshBalance } = useCredits();
  const [recipes, setRecipes] = useState<QuickCookRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const hasCheckedAccess = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Check Pro access on screen focus
      if (!checkProAccess()) {
        // Only redirect to paywall once to prevent infinite loop
        if (!hasCheckedAccess.current) {
          hasCheckedAccess.current = true;
          // Use push so paywall can navigate back after purchase
          router.push('/paywall');
        } else {
          // User came back from paywall without purchasing - go to home
          router.replace('/');
        }
        return;
      }
      // Reset the flag when user has access (after returning from paywall)
      hasCheckedAccess.current = false;
      generateRecipes();
    }, [checkProAccess])
  );

  const generateRecipes = async () => {
    // Check credits
    if (balance !== null && balance < 1) {
      Alert.alert(
        'Insufficient Credits',
        'You need 1 credit to generate recipe suggestions. Purchase credits or earn more by shopping at Walmart.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
          { text: 'OK' }
        ]
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await quickCook(3);
      setRecipes(response.recipes);
      await refreshBalance();
    } catch (error) {
      console.error('Error generating recipes:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to generate recipes',
        [
          { text: 'Go Back', onPress: () => router.back() },
          { text: 'Try Again', onPress: generateRecipes }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMore = async () => {
    if (balance !== null && balance < 1) {
      Alert.alert(
        'Insufficient Credits',
        'You need 1 credit to generate more recipes.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Generate More?',
      'This will cost 1 credit and replace the current suggestions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            await generateRecipes();
            setGenerating(false);
          }
        }
      ]
    );
  };

  const getPantryCoverage = (recipe: QuickCookRecipe) => {
    const total = recipe.ingredients.length;
    const inPantry = recipe.ingredients.filter(i => i.inPantry).length;
    return total > 0 ? Math.round((inPantry / total) * 100) : 0;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.loadingText}>Analyzing your pantry...</Text>
        <Text style={styles.loadingSubtext}>Creating personalized recipes</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>👨‍🍳 What Can I Make?</Text>
          <Text style={styles.headerSubtitle}>Based on your pantry</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {recipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🥘</Text>
            <Text style={styles.emptyText}>
              No recipes could be generated from your pantry.
            </Text>
            <Text style={styles.emptySubtext}>
              Try adding more ingredients to your pantry first.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/pantry')}
            >
              <Text style={styles.emptyButtonText}>Go to Pantry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {recipes.length} {recipes.length === 1 ? 'Recipe' : 'Recipes'} Found
            </Text>

            {recipes.map((recipe) => {
              const coverage = getPantryCoverage(recipe);
              const pantryIngredients = recipe.ingredients.filter(i => i.inPantry);
              const missingIngredients = recipe.ingredients.filter(i => !i.inPantry);

              return (
                <View key={recipe.id} style={styles.recipeCard}>
                  {/* Coverage Badge */}
                  <View style={[
                    styles.coverageBadge,
                    { backgroundColor: coverage >= 80 ? '#10B981' : coverage >= 50 ? '#F59E0B' : '#EF4444' }
                  ]}>
                    <Text style={styles.coverageText}>{coverage}% in pantry</Text>
                  </View>

                  {/* Recipe Info */}
                  <Text style={styles.recipeTitle}>{recipe.title}</Text>
                  {recipe.description && (
                    <Text style={styles.recipeDescription}>{recipe.description}</Text>
                  )}

                  {/* Meta Info */}
                  <View style={styles.recipeMeta}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaIcon}>⏱️</Text>
                      <Text style={styles.metaText}>
                        {recipe.prepTime + recipe.cookTime} min
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaIcon}>🍽️</Text>
                      <Text style={styles.metaText}>{recipe.servings} servings</Text>
                    </View>
                    {recipe.calories && (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaIcon}>🔥</Text>
                        <Text style={styles.metaText}>{recipe.calories} cal</Text>
                      </View>
                    )}
                  </View>

                  {/* Ingredients */}
                  <View style={styles.ingredientsSection}>
                    <Text style={styles.ingredientsSectionTitle}>In Your Pantry:</Text>
                    {pantryIngredients.map((ing, idx) => (
                      <View key={idx} style={styles.ingredientRow}>
                        <Text style={styles.ingredientCheckmark}>✓</Text>
                        <Text style={styles.ingredientName}>{ing.name}</Text>
                        <Text style={styles.ingredientAmount}>
                          {ing.amount} {ing.unit}
                        </Text>
                      </View>
                    ))}

                    {missingIngredients.length > 0 && (
                      <>
                        <Text style={[styles.ingredientsSectionTitle, { marginTop: 12 }]}>
                          Need to Buy:
                        </Text>
                        {missingIngredients.map((ing, idx) => (
                          <View key={idx} style={styles.ingredientRow}>
                            <Text style={styles.ingredientMissing}>○</Text>
                            <Text style={styles.ingredientNameMissing}>{ing.name}</Text>
                            <Text style={styles.ingredientAmount}>
                              {ing.amount} {ing.unit}
                            </Text>
                          </View>
                        ))}
                      </>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.recipeActions}>
                    <TouchableOpacity
                      style={styles.viewRecipeButton}
                      onPress={() => router.push(`/recipe/${recipe.id}`)}
                    >
                      <Text style={styles.viewRecipeButtonText}>View Recipe</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Generate More Button */}
            <TouchableOpacity
              style={styles.generateMoreButton}
              onPress={handleGenerateMore}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Text style={styles.generateMoreText}>🔄 Generate More</Text>
                  <Text style={styles.generateMoreSubtext}>(1 credit)</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  header: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  coverageBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  coverageText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  recipeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  recipeDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  recipeMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIcon: {
    fontSize: 16,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
  },
  ingredientsSection: {
    marginBottom: 16,
  },
  ingredientsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  ingredientCheckmark: {
    fontSize: 16,
    color: '#10B981',
    marginRight: 8,
    width: 20,
  },
  ingredientMissing: {
    fontSize: 16,
    color: '#999',
    marginRight: 8,
    width: 20,
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    textTransform: 'capitalize',
  },
  ingredientNameMissing: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  ingredientAmount: {
    fontSize: 12,
    color: '#999',
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewRecipeButton: {
    flex: 1,
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewRecipeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  generateMoreButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 20,
  },
  generateMoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  generateMoreSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
  },
});
