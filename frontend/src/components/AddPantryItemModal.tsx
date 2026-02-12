import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addInventoryItem } from '../api/mealPlanning';

interface Ingredient {
  id: string;
  name: string;
  category?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onItemAdded: () => void;
}

const COMMON_UNITS = [
  'cups', 'cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'kg', 'ml', 'l',
  'pieces', 'whole', 'can', 'package', 'bunch', 'head'
];

export default function AddPantryItemModal({ visible, onClose, onItemAdded }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Ingredient[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [customName, setCustomName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchIngredients();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const searchIngredients = async () => {
    try {
      setSearching(true);
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'}/ingredients?search=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data.ingredients || []);
    } catch (error) {
      console.error('Error searching ingredients:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectIngredient = (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient);
    setSearchQuery(ingredient.name);
    setSearchResults([]);
  };

  const handleAddItem = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (!selectedIngredient && !customName.trim()) {
      Alert.alert('Missing Ingredient', 'Please select or enter an ingredient name');
      return;
    }

    try {
      setLoading(true);

      const ingredientId = selectedIngredient?.id;
      const name = selectedIngredient ? selectedIngredient.name : customName.trim();

      // If custom name, we need to create the ingredient first
      let finalIngredientId = ingredientId;
      if (!ingredientId && customName.trim()) {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'}/ingredients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: customName.trim(), category: 'Other' })
        });
        const data = await response.json();
        finalIngredientId = data.ingredient.id;
      }

      await addInventoryItem(
        finalIngredientId!,
        amount,
        unit || undefined,
        expiresAt ? expiresAt.toISOString() : undefined
      );

      Alert.alert('Success', `${name} added to pantry`);
      resetForm();
      onItemAdded();
    } catch (error) {
      console.error('Error adding item:', error);
      Alert.alert('Error', 'Failed to add item to pantry');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedIngredient(null);
    setCustomName('');
    setAmount('');
    setUnit('');
    setExpiresAt(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add to Pantry</Text>
          <TouchableOpacity onPress={handleAddItem} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <Text style={styles.addButton}>Add</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.label}>Ingredient</Text>
            <TextInput
              style={styles.input}
              placeholder="Search for ingredient..."
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setSelectedIngredient(null);
              }}
            />

            {searching && (
              <ActivityIndicator size="small" color="#10B981" style={styles.searchLoader} />
            )}

            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map(ingredient => (
                  <TouchableOpacity
                    key={ingredient.id}
                    style={styles.searchResultItem}
                    onPress={() => handleSelectIngredient(ingredient)}
                  >
                    <Text style={styles.searchResultName}>{ingredient.name}</Text>
                    {ingredient.category && (
                      <Text style={styles.searchResultCategory}>{ingredient.category}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!selectedIngredient && searchQuery.length > 0 && searchResults.length === 0 && !searching && (
              <View style={styles.customOption}>
                <Text style={styles.customLabel}>Or create custom item:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Custom ingredient name"
                  value={customName}
                  onChangeText={setCustomName}
                />
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Amount *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 2, 1.5, 500"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Unit</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., cups, oz, g"
              value={unit}
              onChangeText={setUnit}
            />
            <View style={styles.unitSuggestions}>
              {COMMON_UNITS.map(u => (
                <TouchableOpacity
                  key={u}
                  style={styles.unitChip}
                  onPress={() => setUnit(u)}
                >
                  <Text style={styles.unitChipText}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Expiration Date (Optional)</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {expiresAt ? expiresAt.toLocaleDateString() : 'Select date'}
              </Text>
            </TouchableOpacity>
            {expiresAt && (
              <TouchableOpacity
                style={styles.clearDateButton}
                onPress={() => setExpiresAt(null)}
              >
                <Text style={styles.clearDateText}>Clear date</Text>
              </TouchableOpacity>
            )}
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={expiresAt || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  setExpiresAt(selectedDate);
                }
              }}
              minimumDate={new Date()}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666',
  },
  addButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchLoader: {
    marginTop: 8,
  },
  searchResults: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 200,
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultName: {
    fontSize: 16,
    color: '#333',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  searchResultCategory: {
    fontSize: 12,
    color: '#999',
  },
  customOption: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  customLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  unitSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  unitChip: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  unitChipText: {
    fontSize: 12,
    color: '#666',
  },
  dateButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  clearDateButton: {
    marginTop: 8,
  },
  clearDateText: {
    fontSize: 14,
    color: '#EF4444',
  },
});
