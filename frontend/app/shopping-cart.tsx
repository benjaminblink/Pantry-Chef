import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  Linking,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import WalmartProductsModal, {
  WalmartProduct as ModalWalmartProduct,
  SubstituteOption,
  QualityTier
} from '../src/components/WalmartProductsModal';
import { useWalmartProducts } from '../src/hooks';

interface WalmartProduct {
  itemId: string;
  name: string;
  salePrice: number;
  msrp?: number;
  thumbnailImage?: string;
  mediumImage?: string;
  largeImage?: string;
  productUrl?: string;
  categoryPath?: string;
  brandName?: string;
  stock?: string;
  availableOnline?: boolean;
}

interface Ingredient {
  id: string;
  name: string;
  category?: string;
  walmartItemId?: string;
  walmartProductName?: string;
  walmartSearchTerm?: string;
}

interface RecipeIngredient {
  id: string;
  amount: number;
  unit: string;
  purchaseQuantity?: number;
  notes?: string;
  sortOrder: number;
  ingredient: Ingredient;
}

interface Recipe {
  id: string;
  title: string;
  description?: string;
  servings?: number;
  recipeIngredients: RecipeIngredient[];
}

interface RecipeBreakdown {
  recipeId: string;
  recipeTitle: string;
  amount: number;
  unit: string;
}

interface IngredientWithPrice extends RecipeIngredient {
  walmartProduct?: WalmartProduct | null;
  priceLoading: boolean;
  priceError?: string;
  recipeBreakdown?: RecipeBreakdown[];
  originalIngredientName?: string;
}

export default function CartReviewScreen() {
  const params = useLocalSearchParams();
  const { id, recipes: recipesParam, ingredients: ingredientsParam, shoppingListId } = params;
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingredientsWithPrices, setIngredientsWithPrices] = useState<IngredientWithPrice[]>([]);
  const [multipleRecipes, setMultipleRecipes] = useState<Array<{recipeId: string, recipeTitle: string, quantity: number}>>([]);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const {
    modalVisible,
    selectedIngredient,
    similarProducts,
    loadingProducts,
    searchSimilarProducts,
    closeModal,
  } = useWalmartProducts();

  const [selectedIngredientIndex, setSelectedIngredientIndex] = useState<number>(-1);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | undefined>(undefined);
  const [currentShoppingListId, setCurrentShoppingListId] = useState<string | null>(
    (shoppingListId as string) || null
  );

  useEffect(() => {
    if (ingredientsParam && recipesParam) {
      useProvidedIngredients();
    } else if (recipesParam) {
      fetchMultipleRecipes();
    } else if (id) {
      fetchRecipe();
    } else {
      // No URL params — try loading the active cart from the database
      loadActiveCart();
    }
  }, [id, recipesParam, ingredientsParam]);

  // Auto-redirect countdown
  useEffect(() => {
    if (redirectCountdown === null) return;

    if (redirectCountdown === 0) {
      router.push('/recipes');
      return;
    }

    const timer = setTimeout(() => {
      setRedirectCountdown(redirectCountdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [redirectCountdown, router]);

  const useProvidedIngredients = async () => {
    try {
      setLoading(true);
      const recipes = JSON.parse(recipesParam as string);
      const ingredients = JSON.parse(ingredientsParam as string);

      setMultipleRecipes(recipes);
      if (shoppingListId) {
        setCurrentShoppingListId(shoppingListId as string);
      }

      const ingredientsData: IngredientWithPrice[] = ingredients.map((item: any) => ({
        id: item.ingredientId,
        ingredient: {
          id: item.ingredientId,
          name: item.ingredientName
        },
        originalIngredientName: item.ingredientName,
        amount: item.amount,
        unit: item.unit,
        notes: item.recipes ? `Used in: ${item.recipes.join(', ')}` : undefined,
        sortOrder: 0,
        priceLoading: true,
        recipeBreakdown: item.recipeBreakdown
      }));

      setIngredientsWithPrices(ingredientsData);
      await fetchAllPrices(ingredientsData);
    } catch (error) {
      console.error('Use provided ingredients error:', error);
      Alert.alert('Error', 'Failed to load ingredients');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadActiveCart = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        // Not logged in — show empty state
        setLoading(false);
        setRedirectCountdown(3);
        return;
      }

      const response = await fetch(`${API_URL}/cart/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!data.shoppingList || data.shoppingList.items.length === 0) {
        // No active cart — show empty state with redirect
        setLoading(false);
        setRedirectCountdown(3);
        return;
      }

      const list = data.shoppingList;
      setCurrentShoppingListId(list.id);

      const ingredientsData: IngredientWithPrice[] = list.items.map((item: any) => ({
        id: item.ingredientId,
        ingredient: {
          id: item.ingredientId,
          name: item.ingredient?.name || 'Unknown',
        },
        originalIngredientName: item.ingredient?.name,
        amount: parseFloat(item.totalAmount) || 0,
        unit: item.unit,
        sortOrder: 0,
        priceLoading: true,
      }));

      setIngredientsWithPrices(ingredientsData);
      await fetchAllPrices(ingredientsData);
    } catch (error) {
      console.error('Load active cart error:', error);
      // Fall back to empty state
      setRedirectCountdown(3);
    } finally {
      setLoading(false);
    }
  };

  const fetchMultipleRecipes = async () => {
    try {
      setLoading(true);
      const recipes = JSON.parse(recipesParam as string);

      const response = await fetch(`${API_URL}/cart/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipes })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate cart');
      }

      setMultipleRecipes(data.recipes);

      const ingredientsData: IngredientWithPrice[] = data.ingredients.map((item: any) => ({
        id: item.ingredientId,
        ingredient: {
          id: item.ingredientId,
          name: item.ingredientName
        },
        amount: item.amount,
        unit: item.unit,
        notes: `Used in: ${item.recipes.join(', ')}`,
        sortOrder: 0,
        priceLoading: true,
        recipeBreakdown: item.recipeBreakdown
      }));

      setIngredientsWithPrices(ingredientsData);
      await fetchAllPrices(ingredientsData);
    } catch (error) {
      console.error('Fetch multiple recipes error:', error);
      Alert.alert('Error', 'Failed to load recipes');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipe = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/recipes/${id}`);
      const data = await response.json();

      if (data.success) {
        const recipeData = data.data.recipe;
        setRecipe(recipeData);

        const ingredientsData: IngredientWithPrice[] =
          recipeData.recipeIngredients.map((ri: RecipeIngredient) => ({
            ...ri,
            priceLoading: true,
          }));

        setIngredientsWithPrices(ingredientsData);
        await fetchAllPrices(ingredientsData);
      } else {
        Alert.alert('Error', 'Recipe not found');
        router.back();
      }
    } catch (error) {
      console.error('Fetch recipe error:', error);
      Alert.alert('Error', 'Could not connect to server');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchAllPrices = async (ingredients: IngredientWithPrice[]) => {
    try {
      const response = await fetch(`${API_URL}/walmart/recipe-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: ingredients.map(ing => ({
            name: ing.ingredient.name,
            walmartItemId: ing.ingredient.walmartItemId,
            amount: ing.amount,
            unit: ing.unit
          }))
        })
      });

      const data = await response.json();

      if (data.success && data.data.results) {
        setIngredientsWithPrices((prev) =>
          prev.map((item, index) => {
            const result = data.data.results[index];
            return {
              ...item,
              walmartProduct: result?.product || null,
              purchaseQuantity: result?.purchaseCount || item.amount,
              priceLoading: false,
              priceError: result?.error ? 'Failed to fetch price' : undefined
            };
          })
        );
      } else {
        setIngredientsWithPrices((prev) =>
          prev.map((item) => ({
            ...item,
            walmartProduct: null,
            priceLoading: false
          }))
        );
      }
    } catch (error) {
      console.error('Batch pricing error:', error);
      setIngredientsWithPrices((prev) =>
        prev.map((item) => ({
          ...item,
          priceLoading: false,
          priceError: 'Failed to fetch price'
        }))
      );
    }
  };

  const calculateTotalPrice = () => {
    return ingredientsWithPrices.reduce((total, item) => {
      if (item.walmartProduct?.salePrice) {
        return total + item.walmartProduct.salePrice;
      }
      return total;
    }, 0);
  };

  const openProductUrl = (url: string) => {
    if (url) {
      Linking.openURL(url).catch((err) =>
        console.error('Failed to open URL:', err)
      );
    }
  };

  const handleIngredientClick = (ingredientName: string, index: number) => {
    let recipeId = recipe?.id || (multipleRecipes.length > 0 ? multipleRecipes[0].recipeId : undefined);

    if (!recipeId && ingredientsWithPrices[index]?.recipeBreakdown) {
      const breakdown = ingredientsWithPrices[index].recipeBreakdown;
      if (breakdown && breakdown.length > 0) {
        recipeId = (breakdown[0] as any).recipeId;

        if (!recipeId) {
          const firstRecipeTitle = breakdown[0].recipeTitle;
          const matchingRecipe = multipleRecipes.find(r => r.recipeTitle === firstRecipeTitle);
          if (matchingRecipe) {
            recipeId = matchingRecipe.recipeId;
          }
        }
      }
    }

    setSelectedIngredientIndex(index);
    setSelectedRecipeId(recipeId);
    searchSimilarProducts(ingredientName);
  };

  const handleProductSelect = (product: WalmartProduct) => {
    if (selectedIngredientIndex === -1) return;

    setIngredientsWithPrices((prev) =>
      prev.map((item, index) =>
        index === selectedIngredientIndex
          ? { ...item, walmartProduct: product, priceLoading: false }
          : item
      )
    );
  };

  const handleSubstituteSelect = (substitute: SubstituteOption) => {
    if (selectedIngredientIndex === -1) return;

    setIngredientsWithPrices((prev) =>
      prev.map((item, index) =>
        index === selectedIngredientIndex
          ? {
              ...item,
              ingredient: {
                ...item.ingredient,
                name: substitute.name
              },
              amount: item.amount * substitute.conversionRatio,
              priceLoading: true,
            }
          : item
      )
    );

    const updatedIngredient = ingredientsWithPrices[selectedIngredientIndex];
    fetch(`${API_URL}/walmart/recipe-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: [{
          name: substitute.name,
          amount: updatedIngredient.amount * substitute.conversionRatio,
          unit: updatedIngredient.unit
        }]
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.results?.[0]) {
          const result = data.data.results[0];
          setIngredientsWithPrices((prev) =>
            prev.map((item, index) =>
              index === selectedIngredientIndex
                ? {
                    ...item,
                    walmartProduct: result?.product || null,
                    purchaseQuantity: result?.purchaseCount || item.amount,
                    priceLoading: false
                  }
                : item
            )
          );
        }
      })
      .catch(err => {
        console.error('Error fetching substitute price:', err);
        setIngredientsWithPrices((prev) =>
          prev.map((item, index) =>
            index === selectedIngredientIndex
              ? { ...item, priceLoading: false, priceError: 'Failed to fetch price' }
              : item
          )
        );
      });
  };

  const handleQualityTierSelect = (tier: QualityTier, product: WalmartProduct) => {
    if (selectedIngredientIndex === -1) return;

    setIngredientsWithPrices((prev) =>
      prev.map((item, index) =>
        index === selectedIngredientIndex
          ? { ...item, walmartProduct: product, priceLoading: false }
          : item
      )
    );
  };

  const handleDeleteIngredient = (index: number) => {
    Alert.alert(
      'Remove Ingredient',
      `Remove ${ingredientsWithPrices[index].ingredient.name} from cart?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setIngredientsWithPrices((prev) => prev.filter((_, i) => i !== index));
          },
        },
      ]
    );
  };

  const handlePurchaseQuantityChange = (index: number, value: string) => {
    const numValue = parseFloat(value);

    if (isNaN(numValue) || numValue <= 0) {
      return;
    }

    setIngredientsWithPrices((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, purchaseQuantity: numValue }
          : item
      )
    );
  };

  const handleClearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setIngredientsWithPrices([]);
            setMultipleRecipes([]);
            // Also clear the active cart in the backend so it doesn't reload
            try {
              const token = await AsyncStorage.getItem('authToken');
              if (token) {
                await fetch(`${API_URL}/cart/active`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
            } catch (err) {
              console.error('Failed to clear cart on server:', err);
            }
          },
        },
      ]
    );
  };

  const handleCancelRedirect = () => {
    setRedirectCountdown(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Empty cart state (also triggers after clearing cart)
  if (ingredientsWithPrices.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Shopping Cart</Text>

          <View style={styles.emptyCartContainer}>
            <Text style={styles.emptyCartIcon}>🛒</Text>
            <Text style={styles.emptyCartTitle}>Your cart is empty</Text>
            <Text style={styles.emptyCartSubtitle}>
              Add recipes or meal plans to get started
            </Text>

            {redirectCountdown !== null && (
              <View style={styles.countdownContainer}>
                <Text style={styles.countdownText}>
                  Automatically redirecting to recipe selection in {redirectCountdown}...
                </Text>
                <TouchableOpacity
                  style={styles.cancelRedirectButton}
                  onPress={handleCancelRedirect}
                >
                  <Text style={styles.cancelRedirectText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.emptyCartActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/recipes')}
              >
                <Text style={styles.actionButtonIcon}>🍳</Text>
                <Text style={styles.actionButtonText}>Add Recipes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/meal-plans')}
              >
                <Text style={styles.actionButtonIcon}>📋</Text>
                <Text style={styles.actionButtonText}>Add from Meal Plans</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const totalPrice = calculateTotalPrice();
  const pricesLoaded = ingredientsWithPrices.every((i) => !i.priceLoading);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Shopping Cart</Text>
        <Text style={styles.subtitle}>Walmart Pricing</Text>

        {multipleRecipes.length > 0 && (
          <View style={styles.recipeSummaryCard}>
            <Text style={styles.recipeSummaryTitle}>Selected Recipes</Text>
            {multipleRecipes.map((r) => (
              <Text key={r.recipeId} style={styles.recipeSummaryItem}>
                {r.quantity}× {r.recipeTitle}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Estimated Total Cost</Text>
          {pricesLoaded ? (
            <Text style={styles.totalPrice}>
              ${totalPrice.toFixed(2)}
            </Text>
          ) : (
            <View style={styles.totalLoading}>
              <ActivityIndicator color="white" />
              <Text style={styles.totalLoadingText}>Calculating...</Text>
            </View>
          )}
          {recipe?.servings && pricesLoaded && (
            <Text style={styles.perServing}>
              ${(totalPrice / recipe.servings).toFixed(2)} per serving
            </Text>
          )}
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Prices are estimates based on Walmart product searches. Actual
            prices may vary. Quantities shown are approximate.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Ingredient Prices ({ingredientsWithPrices.length})
          </Text>
          <Text style={styles.sectionSubtitle}>
            Tap any ingredient to browse more options
          </Text>

          {ingredientsWithPrices.map((item, index) => (
            <View
              key={`${item.ingredient.id || item.ingredient.name}-${index}`}
              style={styles.ingredientCard}
            >
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteIngredient(index)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.deleteButtonText}>✕</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.ingredientCardContent}
                onPress={() => handleIngredientClick(item.ingredient.name, index)}
                activeOpacity={0.8}
              >
                <View style={styles.ingredientHeader}>
                  <View style={styles.ingredientInfo}>
                    <Text style={styles.ingredientName}>
                      {item.ingredient.name}
                    </Text>
                    <Text style={styles.ingredientQuantity}>
                      Total needed: {item.amount} {item.unit}
                    </Text>

                    {item.recipeBreakdown && item.recipeBreakdown.length > 0 && (
                      <View style={styles.recipeBreakdownContainer}>
                        {item.recipeBreakdown.map((breakdown, idx) => (
                          <View key={idx} style={styles.recipeBreakdownCard}>
                            <Text style={styles.recipeBreakdownRecipe}>
                              {breakdown.recipeTitle}
                            </Text>
                            <Text style={styles.recipeBreakdownAmount}>
                              {breakdown.amount} {breakdown.unit}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={styles.purchaseQuantityContainer}>
                      <Text style={styles.purchaseQuantityLabel}>Purchase:</Text>
                      <TextInput
                        style={styles.purchaseQuantityInput}
                        value={String(item.purchaseQuantity || item.amount)}
                        onChangeText={(value) => handlePurchaseQuantityChange(index, value)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                      <Text style={styles.purchaseQuantityUnit}>
                        {item.walmartProduct ? 'count' : item.unit}
                      </Text>
                    </View>
                  </View>
                </View>

                {item.priceLoading ? (
                  <View style={styles.priceLoading}>
                    <ActivityIndicator size="small" color="#34C759" />
                    <Text style={styles.priceLoadingText}>
                      Searching Walmart...
                    </Text>
                  </View>
                ) : item.priceError ? (
                  <View style={styles.priceError}>
                    <Text style={styles.priceErrorText}>{item.priceError}</Text>
                  </View>
                ) : item.walmartProduct ? (
                  <View style={styles.productInfo}>
                    {item.walmartProduct.thumbnailImage && (
                      <Image
                        source={{ uri: item.walmartProduct.thumbnailImage }}
                        style={styles.productImage}
                        resizeMode="contain"
                      />
                    )}

                    <View style={styles.productDetails}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {item.walmartProduct.name}
                      </Text>

                      {item.walmartProduct.brandName && (
                        <Text style={styles.brandName}>
                          {item.walmartProduct.brandName}
                        </Text>
                      )}

                      <View style={styles.priceContainer}>
                        <Text style={styles.price}>
                          ${item.walmartProduct.salePrice.toFixed(2)}
                        </Text>
                        {item.walmartProduct.msrp &&
                          item.walmartProduct.msrp > item.walmartProduct.salePrice && (
                            <Text style={styles.msrp}>
                              ${item.walmartProduct.msrp.toFixed(2)}
                            </Text>
                          )}
                      </View>

                      {item.walmartProduct.availableOnline && (
                        <Text style={styles.availability}>Available Online</Text>
                      )}

                      {item.walmartProduct.productUrl && (
                        <TouchableOpacity
                          style={styles.viewButton}
                          onPress={() => openProductUrl(item.walmartProduct!.productUrl!)}
                        >
                          <Text style={styles.viewButtonText}>
                            View on Walmart
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.noPrice}>
                    <Text style={styles.noPriceText}>
                      No pricing available
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {ingredientsWithPrices.length > 0 && (
          <View style={styles.cartActionsFooter}>
            <TouchableOpacity
              style={styles.clearCartButton}
              onPress={handleClearCart}
            >
              <Text style={styles.clearCartButtonText}>Clear Cart</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/recipes')}
            >
              <Text style={styles.actionButtonIcon}>🍳</Text>
              <Text style={styles.actionButtonText}>Add More Recipes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/meal-plans')}
            >
              <Text style={styles.actionButtonIcon}>📋</Text>
              <Text style={styles.actionButtonText}>Add from Meal Plans</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Powered by Walmart Open API
          </Text>
        </View>
      </View>

      <WalmartProductsModal
        visible={modalVisible}
        onClose={closeModal}
        ingredientName={selectedIngredient}
        ingredientId={selectedIngredientIndex >= 0 ? ingredientsWithPrices[selectedIngredientIndex]?.ingredient.id : undefined}
        originalIngredientName={selectedIngredientIndex >= 0 ? ingredientsWithPrices[selectedIngredientIndex]?.originalIngredientName : undefined}
        recipeId={selectedRecipeId}
        products={similarProducts}
        loading={loadingProducts}
        onProductSelect={handleProductSelect}
        onSubstituteSelect={handleSubstituteSelect}
        onQualityTierSelect={handleQualityTierSelect}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#999',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    marginBottom: 15,
  },
  backButtonText: {
    color: '#34C759',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  recipeSummaryCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recipeSummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  recipeSummaryItem: {
    fontSize: 14,
    color: '#666',
    paddingVertical: 4,
  },
  totalCard: {
    backgroundColor: '#34C759',
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  totalLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalPrice: {
    fontSize: 42,
    fontWeight: 'bold',
    color: 'white',
  },
  totalLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  totalLoadingText: {
    fontSize: 16,
    color: 'white',
  },
  perServing: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
  },
  disclaimer: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 18,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    fontStyle: 'italic',
  },
  ingredientCard: {
    position: 'relative',
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  ingredientCardContent: {
    padding: 15,
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ingredientQuantity: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  recipeBreakdownContainer: {
    marginVertical: 10,
    gap: 6,
  },
  recipeBreakdownCard: {
    backgroundColor: '#e8f5e9',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeBreakdownRecipe: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  recipeBreakdownAmount: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '600',
    marginLeft: 8,
  },
  purchaseQuantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  purchaseQuantityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  purchaseQuantityInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
    minWidth: 60,
    textAlign: 'center',
  },
  purchaseQuantityUnit: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  priceLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  priceLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  priceError: {
    paddingVertical: 8,
  },
  priceErrorText: {
    fontSize: 14,
    color: '#dc3545',
    fontStyle: 'italic',
  },
  noPrice: {
    paddingVertical: 8,
  },
  noPriceText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  productInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
    lineHeight: 18,
  },
  brandName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#34C759',
  },
  msrp: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  availability: {
    fontSize: 11,
    color: '#28a745',
    marginBottom: 8,
  },
  viewButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  viewButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  emptyCartContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyCartIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyCartTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  emptyCartSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  countdownContainer: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  countdownText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
    marginBottom: 8,
  },
  cancelRedirectButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'white',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  cancelRedirectText: {
    fontSize: 12,
    color: '#856404',
    fontWeight: '600',
  },
  emptyCartActions: {
    width: '100%',
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#34C759',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearCartButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  clearCartButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  cartActionsFooter: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
});
