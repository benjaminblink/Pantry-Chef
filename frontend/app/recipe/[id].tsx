import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { API_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../contexts/CreditContext';

interface Ingredient {
  id: string;
  name: string;
}

interface RecipeIngredient {
  id: string;
  amount: number;
  unit: string;
  ingredient: Ingredient;
}

interface Recipe {
  id: string;
  title: string;
  description?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string;
  instructions: string[];
  recipeIngredients: RecipeIngredient[];
  isImported?: boolean;
  isAiGenerated?: boolean;
  usageCost?: number;
  sourceUrl?: string;
  sourceWebsite?: string;
}

export default function RecipeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { token } = useAuth();
  const { balance, refreshBalance } = useCredits();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [clearCartOnEntry, setClearCartOnEntry] = useState(true);

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchRecipe = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/recipes/${id}`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : {},
      });
      const data = await response.json();

      if (data.success) {
        setRecipe(data.data.recipe);
      } else {
        Alert.alert('Error', 'Failed to fetch recipe');
        router.back();
      }
    } catch (error) {
      console.error('Fetch recipe error:', error);
      Alert.alert('Connection Error', 'Could not connect to server');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async () => {
    if (!recipe) return;

    const creditsNeeded = recipe.usageCost || 0;

    // Check if user has enough credits
    if (creditsNeeded > 0 && balance !== null && balance < creditsNeeded) {
      Alert.alert(
        'Insufficient Credits',
        `You need ${creditsNeeded} credits to add this recipe to cart. You have ${balance} credits.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Credits',
            onPress: () => router.push('/paywall'),
          },
        ]
      );
      return;
    }

    setAddingToCart(true);

    try {
      const response = await fetch(`${API_URL}/cart/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipes: [{ recipeId: recipe.id, quantity: 1 }],
          clearCart: clearCartOnEntry,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          Alert.alert(
            'Insufficient Credits',
            data.message || `You need ${creditsNeeded} credits to add this recipe to cart.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Buy Credits',
                onPress: () => router.push('/paywall'),
              },
            ]
          );
          return;
        }

        throw new Error(data.error || 'Failed to add to cart');
      }

      // Refresh credit balance
      await refreshBalance();

      // Prepare navigation params
      const ingredients = data.ingredients || [];
      const recipes = data.recipes || [{
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        quantity: 1,
      }];

      // Navigate to shopping cart
      Alert.alert(
        'Added to Cart!',
        creditsNeeded > 0
          ? `Recipe added to cart (${creditsNeeded} credits charged). New balance: ${balance! - creditsNeeded} credits.`
          : 'Recipe added to cart!',
        [
          {
            text: 'View Cart',
            onPress: () => {
              if (data.potentialMerges && data.potentialMerges.length > 0) {
                router.push({
                  pathname: '/merge-review',
                  params: {
                    shoppingListId: data.shoppingListId,
                    potentialMerges: JSON.stringify(data.potentialMerges),
                    ingredients: JSON.stringify(ingredients),
                    recipes: JSON.stringify(recipes),
                    clearCart: clearCartOnEntry.toString(),
                  },
                });
              } else {
                router.push({
                  pathname: '/shopping-cart',
                  params: {
                    shoppingListId: data.shoppingListId,
                    ingredients: JSON.stringify(ingredients),
                    recipes: JSON.stringify(recipes),
                    clearCart: clearCartOnEntry.toString(),
                  },
                });
              }
            },
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
    } catch (error: any) {
      console.error('Add to cart error:', error);
      Alert.alert('Error', error.message || 'Failed to add recipe to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recipe</Text>
          <View style={styles.placeholder} />
        </View>
        <ActivityIndicator style={styles.loader} size="large" color="#007AFF" />
      </View>
    );
  }

  if (!recipe) {
    return null;
  }

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recipe</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.placeholderImage]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        <View style={styles.contentPadding}>
          <Text style={styles.title}>{recipe.title}</Text>

          {recipe.description && (
            <Text style={styles.description}>{recipe.description}</Text>
          )}

          <View style={styles.statsRow}>
            {recipe.prepTimeMinutes ? (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Prep</Text>
                <Text style={styles.statValue}>{recipe.prepTimeMinutes}m</Text>
              </View>
            ) : null}
            {recipe.cookTimeMinutes ? (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Cook</Text>
                <Text style={styles.statValue}>{recipe.cookTimeMinutes}m</Text>
              </View>
            ) : null}
            {totalTime > 0 ? (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total</Text>
                <Text style={styles.statValue}>{totalTime}m</Text>
              </View>
            ) : null}
            {recipe.servings ? (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Servings</Text>
                <Text style={styles.statValue}>{recipe.servings}</Text>
              </View>
            ) : null}
          </View>

          {recipe.calories ? (
            <View style={styles.nutritionCard}>
              <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>
              <View style={styles.nutritionGrid}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{recipe.calories}</Text>
                  <Text style={styles.nutritionLabel}>Calories</Text>
                </View>
                {recipe.protein ? (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>{recipe.protein}g</Text>
                    <Text style={styles.nutritionLabel}>Protein</Text>
                  </View>
                ) : null}
                {recipe.carbs ? (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>{recipe.carbs}g</Text>
                    <Text style={styles.nutritionLabel}>Carbs</Text>
                  </View>
                ) : null}
                {recipe.fat ? (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>{recipe.fat}g</Text>
                    <Text style={styles.nutritionLabel}>Fat</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {recipe.recipeIngredients.map((item, index) => (
              <View key={item.id} style={styles.ingredientRow}>
                <Text style={styles.ingredientBullet}>•</Text>
                <Text style={styles.ingredientText}>
                  {item.amount} {item.unit} {item.ingredient.name}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {recipe.instructions.map((instruction, index) => (
              <View key={index} style={styles.instructionRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.instructionText}>{instruction}</Text>
              </View>
            ))}
          </View>

          {recipe.sourceUrl && (
            <View style={styles.sourceCard}>
              <Text style={styles.sourceLabel}>Imported from:</Text>
              <Text style={styles.sourceText}>{recipe.sourceWebsite || recipe.sourceUrl}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.bottomBarContent}>
          <View style={styles.costInfo}>
            {recipe.usageCost !== undefined && recipe.usageCost > 0 ? (
              <>
                <Text style={styles.costLabel}>Cost to add to cart:</Text>
                <Text style={styles.costValue}>{recipe.usageCost} credits</Text>
                {balance !== null && (
                  <Text style={styles.balanceText}>Balance: {balance} credits</Text>
                )}
              </>
            ) : (
              <Text style={styles.freeText}>Free to add to cart</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.addButton, addingToCart && styles.addButtonDisabled]}
            onPress={handleAddToCart}
            disabled={addingToCart}
          >
            {addingToCart ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>Add to Cart</Text>
            )}
          </TouchableOpacity>
        </View>
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
    </View>
  );
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
    backgroundColor: '#007AFF',
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
  heroImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#e0e0e0',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 18,
  },
  contentPadding: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    minWidth: 70,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  nutritionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#999',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },
  ingredientBullet: {
    fontSize: 16,
    color: '#007AFF',
    marginRight: 8,
    marginTop: 2,
  },
  ingredientText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    lineHeight: 22,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    lineHeight: 24,
  },
  sourceCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  sourceLabel: {
    fontSize: 12,
    color: '#856404',
    marginBottom: 4,
    fontWeight: '600',
  },
  sourceText: {
    fontSize: 14,
    color: '#856404',
  },
  bottomBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  costInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  costLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  costValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 2,
  },
  balanceText: {
    fontSize: 12,
    color: '#999',
  },
  freeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
