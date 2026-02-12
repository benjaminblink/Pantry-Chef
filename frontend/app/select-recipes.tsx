import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { API_URL } from "../config";
import { generateCartWithMergeDetection, navigateAfterCartGeneration } from "../utils/cartGeneration";

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  prepTime: number;
  cookTime: number;
  servings: number;
  imageUrl: string | null;
}

interface RecipeSelection {
  recipe: Recipe;
  quantity: number;
}

export default function ShoppingCartScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<RecipeSelection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    try {
      const response = await fetch(`${API_URL}/recipes`);
      const data = await response.json();
      setRecipes(data.data?.recipes || data.recipes || []);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      Alert.alert("Error", "Failed to load recipes");
    } finally {
      setLoading(false);
    }
  };

  const toggleRecipe = (recipe: Recipe) => {
    const existing = selectedRecipes.find((r) => r.recipe.id === recipe.id);
    if (existing) {
      setSelectedRecipes(selectedRecipes.filter((r) => r.recipe.id !== recipe.id));
    } else {
      setSelectedRecipes([...selectedRecipes, { recipe, quantity: 1 }]);
    }
  };

  const updateQuantity = (recipeId: string, delta: number) => {
    setSelectedRecipes(
      selectedRecipes.map((selection) => {
        if (selection.recipe.id === recipeId) {
          const newQuantity = Math.max(1, selection.quantity + delta);
          return { ...selection, quantity: newQuantity };
        }
        return selection;
      })
    );
  };

  const isSelected = (recipeId: string) => {
    return selectedRecipes.some((r) => r.recipe.id === recipeId);
  };

  const getQuantity = (recipeId: string) => {
    return selectedRecipes.find((r) => r.recipe.id === recipeId)?.quantity || 0;
  };

  const handleContinue = async () => {
    if (selectedRecipes.length === 0) {
      Alert.alert("No Recipes Selected", "Please select at least one recipe");
      return;
    }

    try {
      setLoading(true);

      const recipeSelections = selectedRecipes.map((s) => ({
        recipeId: s.recipe.id,
        quantity: s.quantity,
      }));

      const result = await generateCartWithMergeDetection(recipeSelections);
      navigateAfterCartGeneration(router, result);
    } catch (error) {
      console.error('Error generating cart:', error);
      Alert.alert('Error', 'Failed to generate shopping cart');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Loading recipes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Recipes</Text>
        <Text style={styles.headerSubtitle}>
          Choose recipes to add to your shopping cart
        </Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {recipes.map((recipe) => {
          const selected = isSelected(recipe.id);
          const quantity = getQuantity(recipe.id);

          return (
            <TouchableOpacity
              key={recipe.id}
              style={[styles.recipeCard, selected && styles.recipeCardSelected]}
              onPress={() => toggleRecipe(recipe)}
            >
              <View style={styles.recipeHeader}>
                <View style={styles.recipeInfo}>
                  <Text style={styles.recipeTitle}>{recipe.title}</Text>
                  {recipe.description && (
                    <Text style={styles.recipeDescription} numberOfLines={2}>
                      {recipe.description}
                    </Text>
                  )}
                  <Text style={styles.recipeStats}>
                    {recipe.prepTime + recipe.cookTime} min • {recipe.servings} servings
                  </Text>
                </View>

                <View style={styles.checkbox}>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </View>

              {selected && (
                <View style={styles.quantityContainer}>
                  <Text style={styles.quantityLabel}>How many times?</Text>
                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        updateQuantity(recipe.id, -1);
                      }}
                    >
                      <Text style={styles.quantityButtonText}>−</Text>
                    </TouchableOpacity>

                    <Text style={styles.quantityValue}>{quantity}</Text>

                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        updateQuantity(recipe.id, 1);
                      }}
                    >
                      <Text style={styles.quantityButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedRecipes.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerCount}>
              {selectedRecipes.length} recipe{selectedRecipes.length !== 1 ? "s" : ""} selected
            </Text>
            <Text style={styles.footerSubtext}>
              {selectedRecipes.reduce((sum, s) => sum + s.quantity, 0)} total meals
            </Text>
          </View>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue to Cart</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  header: {
    backgroundColor: "#34C759",
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  scrollView: {
    flex: 1,
    padding: 15,
  },
  recipeCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  recipeCardSelected: {
    borderColor: "#34C759",
    backgroundColor: "#e8f5e9",
  },
  recipeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  recipeInfo: {
    flex: 1,
    marginRight: 10,
  },
  recipeTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  recipeDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  recipeStats: {
    fontSize: 12,
    color: "#999",
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#34C759",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    fontSize: 18,
    color: "#34C759",
    fontWeight: "bold",
  },
  quantityContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#34C759",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonText: {
    fontSize: 20,
    color: "white",
    fontWeight: "bold",
  },
  quantityValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    minWidth: 30,
    textAlign: "center",
  },
  footer: {
    backgroundColor: "white",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerInfo: {
    flex: 1,
  },
  footerCount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  footerSubtext: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  continueButton: {
    backgroundColor: "#34C759",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  continueButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
