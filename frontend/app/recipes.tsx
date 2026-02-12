import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { generateCartWithMergeDetection, navigateAfterCartGeneration } from '../utils/cartGeneration';

interface Ingredient {
  id: string;
  name: string;
  category?: string;
}

interface RecipeIngredient {
  id: string;
  quantity: string;
  unit: string;
  notes?: string;
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
  recipeIngredients: RecipeIngredient[];
}

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [view, setView] = useState<'all' | 'personal'>('all');
  const [selectedRecipes, setSelectedRecipes] = useState<Map<string, number>>(new Map());
  const [generatingCart, setGeneratingCart] = useState(false);
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  useEffect(() => {
    fetchRecipes();
  }, [page, view]);

  const fetchRecipes = async () => {
    if (!isAuthenticated || !token) {
      Alert.alert('Error', 'You must be logged in to view recipes');
      router.push('/login');
      return;
    }

    try {
      setRefreshing(true);
      const response = await fetch(`${API_URL}/recipes?page=${page}&limit=20&view=${view}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setRecipes(data.data.recipes);
        setTotalPages(data.data.pagination.totalPages);
      } else {
        Alert.alert('Error', 'Failed to fetch recipes');
      }
    } catch (error) {
      console.error('Fetch recipes error:', error);
      Alert.alert(
        'Connection Error',
        'Could not connect to server. Make sure Docker containers are running.'
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const handleRecipePress = (recipeId: string) => {
    router.push(`/recipe/${recipeId}`);
  };

  const toggleRecipeSelection = (recipeId: string) => {
    setSelectedRecipes(prev => {
      const next = new Map(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.set(recipeId, 1);
      }
      return next;
    });
  };

  const updateQuantity = (recipeId: string, delta: number) => {
    setSelectedRecipes(prev => {
      const next = new Map(prev);
      const current = next.get(recipeId) || 1;
      const newQty = Math.max(1, current + delta);
      next.set(recipeId, newQty);
      return next;
    });
  };

  const handleContinueToCart = async () => {
    if (selectedRecipes.size === 0) return;

    try {
      setGeneratingCart(true);
      const recipeSelections = Array.from(selectedRecipes.entries()).map(
        ([recipeId, quantity]) => ({ recipeId, quantity })
      );

      const result = await generateCartWithMergeDetection(recipeSelections);
      setSelectedRecipes(new Map());
      navigateAfterCartGeneration(router, result);
    } catch (error) {
      console.error('Error generating cart:', error);
      Alert.alert('Error', 'Failed to generate shopping cart');
    } finally {
      setGeneratingCart(false);
    }
  };

  const totalMeals = Array.from(selectedRecipes.values()).reduce((sum, qty) => sum + qty, 0);

  const renderRecipeCard = ({ item }: { item: Recipe }) => {
    const isSelected = selectedRecipes.has(item.id);
    const quantity = selectedRecipes.get(item.id) || 0;

    return (
      <View style={[styles.recipeCard, isSelected && styles.recipeCardSelected]}>
        <TouchableOpacity
          onPress={() => handleRecipePress(item.id)}
          activeOpacity={0.7}
        >
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.recipeImage} />
          ) : (
            <View style={[styles.recipeImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>No Image</Text>
            </View>
          )}

          <View style={styles.recipeContent}>
            <Text style={styles.recipeTitle}>{item.title}</Text>
            {item.description && (
              <Text style={styles.recipeDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}

            <View style={styles.recipeStats}>
              {item.prepTimeMinutes && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Prep:</Text>
                  <Text style={styles.statValue}>{item.prepTimeMinutes}m</Text>
                </View>
              )}
              {item.cookTimeMinutes && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Cook:</Text>
                  <Text style={styles.statValue}>{item.cookTimeMinutes}m</Text>
                </View>
              )}
              {item.servings && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Servings:</Text>
                  <Text style={styles.statValue}>{item.servings}</Text>
                </View>
              )}
            </View>

            {item.calories && (
              <View style={styles.nutrition}>
                <Text style={styles.nutritionText}>
                  {item.calories} cal
                </Text>
                {item.protein && (
                  <Text style={styles.nutritionText}>P: {item.protein}g</Text>
                )}
                {item.carbs && (
                  <Text style={styles.nutritionText}>C: {item.carbs}g</Text>
                )}
                {item.fat && (
                  <Text style={styles.nutritionText}>F: {item.fat}g</Text>
                )}
              </View>
            )}

            {item.recipeIngredients && (
              <Text style={styles.ingredientCount}>
                {item.recipeIngredients.length} ingredients
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Selection checkbox */}
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => toggleRecipeSelection(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>

        {/* Quantity controls when selected */}
        {isSelected && (
          <View style={styles.quantityBar}>
            <Text style={styles.quantityLabel}>How many times?</Text>
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateQuantity(item.id, -1)}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateQuantity(item.id, 1)}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Recipes</Text>
            <Text style={styles.headerSubtitle}>
              {view === 'all' ? 'Your recipes + public recipes' : 'Your recipes only'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-recipe')}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, view === 'all' && styles.toggleButtonActive]}
            onPress={() => setView('all')}
          >
            <Text style={[styles.toggleButtonText, view === 'all' && styles.toggleButtonTextActive]}>
              All Recipes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, view === 'personal' && styles.toggleButtonActive]}
            onPress={() => setView('personal')}
          >
            <Text style={[styles.toggleButtonText, view === 'personal' && styles.toggleButtonTextActive]}>
              My Recipes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {refreshing && recipes.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color="#007AFF" />
      ) : recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No recipes yet</Text>
          <Text style={styles.emptySubtext}>
            Recipes will appear here when added to the database
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={recipes}
            renderItem={renderRecipeCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              selectedRecipes.size > 0 && { paddingBottom: 90 },
            ]}
            onRefresh={fetchRecipes}
            refreshing={refreshing}
            showsVerticalScrollIndicator={false}
          />

          {totalPages > 1 && selectedRecipes.size === 0 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
                onPress={() => setPage(page - 1)}
                disabled={page === 1}
              >
                <Text style={styles.pageButtonText}>Previous</Text>
              </TouchableOpacity>

              <Text style={styles.pageInfo}>
                Page {page} of {totalPages}
              </Text>

              <TouchableOpacity
                style={[
                  styles.pageButton,
                  page === totalPages && styles.pageButtonDisabled,
                ]}
                onPress={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                <Text style={styles.pageButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Cart footer */}
      {selectedRecipes.size > 0 && (
        <View style={styles.cartFooter}>
          <View style={styles.cartFooterInfo}>
            <Text style={styles.cartFooterCount}>
              {selectedRecipes.size} recipe{selectedRecipes.size !== 1 ? 's' : ''} selected
            </Text>
            <Text style={styles.cartFooterSubtext}>
              {totalMeals} total meal{totalMeals !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.cartFooterButton, generatingCart && styles.cartFooterButtonDisabled]}
            onPress={handleContinueToCart}
            disabled={generatingCart}
          >
            {generatingCart ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.cartFooterButtonText}>Add to Cart</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 4,
    marginTop: 15,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'white',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  toggleButtonTextActive: {
    color: '#007AFF',
  },
  addButton: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  listContent: {
    padding: 15,
  },
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recipeCardSelected: {
    borderColor: '#34C759',
  },
  recipeImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#e0e0e0',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 16,
  },
  recipeContent: {
    padding: 15,
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
  recipeStats: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 15,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginRight: 4,
  },
  statValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  nutrition: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  nutritionText: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ingredientCount: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  selectButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  checkboxSelected: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  checkmark: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
  quantityBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#e8f5e9',
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 24,
    textAlign: 'center',
  },
  cartFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  cartFooterInfo: {
    flex: 1,
  },
  cartFooterCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  cartFooterSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cartFooterButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  cartFooterButtonDisabled: {
    opacity: 0.7,
  },
  cartFooterButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  pageButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pageButtonDisabled: {
    backgroundColor: '#ccc',
  },
  pageButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  pageInfo: {
    fontSize: 14,
    color: '#666',
  },
});
