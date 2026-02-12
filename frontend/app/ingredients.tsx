import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';

interface Ingredient {
  id: string;
  name: string;
  category?: string;
  walmartItemId?: string;
  walmartSearchTerm?: string;
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
}

export default function IngredientsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [filteredIngredients, setFilteredIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    'All',
    'Vegetables',
    'Fruits',
    'Proteins',
    'Grains',
    'Dairy',
    'Spices',
    'Other',
  ];

  useEffect(() => {
    fetchIngredients();
  }, []);

  useEffect(() => {
    filterIngredients();
  }, [searchQuery, selectedCategory, ingredients]);

  const fetchIngredients = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`${API_URL}/ingredients`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : {},
      });
      const data = await response.json();

      if (data.success) {
        setIngredients(data.data.ingredients);
      } else {
        Alert.alert('Error', 'Failed to fetch ingredients');
      }
    } catch (error) {
      console.error('Fetch ingredients error:', error);
      Alert.alert(
        'Connection Error',
        'Could not connect to server. Make sure Docker containers are running.'
      );
    } finally {
      setRefreshing(false);
    }
  };

  const filterIngredients = () => {
    let filtered = ingredients;

    if (selectedCategory && selectedCategory !== 'All') {
      filtered = filtered.filter(
        (ing) =>
          ing.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((ing) =>
        ing.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredIngredients(filtered);
  };

  const renderIngredientCard = ({ item }: { item: Ingredient }) => (
    <View style={styles.ingredientCard}>
      <View style={styles.ingredientHeader}>
        <Text style={styles.ingredientName}>{item.name}</Text>
        {item.walmartItemId ? (
          <View style={styles.walmartBadge}>
            <Text style={styles.walmartText}>Walmart</Text>
          </View>
        ) : null}
      </View>

      {item.category ? (
        <Text style={styles.category}>{item.category}</Text>
      ) : null}

      {(item.caloriesPer100g ||
        item.proteinPer100g ||
        item.carbsPer100g ||
        item.fatPer100g) ? (
        <View style={styles.nutritionRow}>
          <Text style={styles.nutritionLabel}>Per 100g:</Text>
          {item.caloriesPer100g ? (
            <Text style={styles.nutritionItem}>
              {item.caloriesPer100g} cal
            </Text>
          ) : null}
          {item.proteinPer100g ? (
            <Text style={styles.nutritionItem}>
              P: {item.proteinPer100g}g
            </Text>
          ) : null}
          {item.carbsPer100g ? (
            <Text style={styles.nutritionItem}>
              C: {item.carbsPer100g}g
            </Text>
          ) : null}
          {item.fatPer100g ? (
            <Text style={styles.nutritionItem}>
              F: {item.fatPer100g}g
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderCategoryButton = (category: string) => (
    <TouchableOpacity
      key={category}
      style={[
        styles.categoryButton,
        (selectedCategory === category ||
          (category === 'All' && !selectedCategory)) &&
          styles.categoryButtonActive,
      ]}
      onPress={() =>
        setSelectedCategory(category === 'All' ? null : category)
      }
    >
      <Text
        style={[
          styles.categoryButtonText,
          (selectedCategory === category ||
            (category === 'All' && !selectedCategory)) &&
            styles.categoryButtonTextActive,
        ]}
      >
        {category}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Ingredients</Text>
            <Text style={styles.headerSubtitle}>
              {ingredients.length} total ingredients
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-ingredient')}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search ingredients..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.categoriesContainer}>
        <FlatList
          horizontal
          data={categories}
          renderItem={({ item }) => renderCategoryButton(item)}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesList}
        />
      </View>

      {refreshing && ingredients.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color="#007AFF" />
      ) : filteredIngredients.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {searchQuery || selectedCategory
              ? 'No ingredients found'
              : 'No ingredients yet'}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery || selectedCategory
              ? 'Try a different search or category'
              : 'Ingredients will appear here when added'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredIngredients}
          renderItem={renderIngredientCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={fetchIngredients}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
        />
      )}

      {filteredIngredients.length > 0 && (
        <View style={styles.resultsBar}>
          <Text style={styles.resultsText}>
            Showing {filteredIngredients.length} of {ingredients.length} ingredients
          </Text>
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
    backgroundColor: '#34C759',
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
  addButton: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#34C759',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchContainer: {
    padding: 15,
    backgroundColor: 'white',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  categoriesContainer: {
    backgroundColor: 'white',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  categoriesList: {
    paddingHorizontal: 15,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  categoryButtonActive: {
    backgroundColor: '#34C759',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  categoryButtonTextActive: {
    color: 'white',
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
  ingredientCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ingredientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  walmartBadge: {
    backgroundColor: '#0071dc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  walmartText: {
    fontSize: 10,
    color: 'white',
    fontWeight: 'bold',
  },
  category: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  nutritionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#999',
    marginRight: 4,
  },
  nutritionItem: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resultsBar: {
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'center',
  },
  resultsText: {
    fontSize: 12,
    color: '#666',
  },
});
