import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert
} from 'react-native';
import {
  getUserInventory,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem
} from '../api/mealPlanning';
import type { UserInventory } from '../types/mealPlanning';

interface Props {
  onSelectionChange?: (selectedIds: string[]) => void;
  selectable?: boolean;
}

export function InventoryManager({ onSelectionChange, selectable = false }: Props) {
  const [inventory, setInventory] = useState<UserInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadInventory();
  }, []);

  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Array.from(selectedIds));
    }
  }, [selectedIds, onSelectionChange]);

  async function loadInventory() {
    try {
      setLoading(true);
      const items = await getUserInventory(true);
      setInventory(items);
    } catch (error) {
      console.error('Error loading inventory:', error);
      Alert.alert('Error', 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleAvailable(item: UserInventory) {
    try {
      await updateInventoryItem(item.id, {
        isAvailable: !item.isAvailable
      });
      setInventory(prev =>
        prev.map(i => i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i)
      );
    } catch (error) {
      console.error('Error updating inventory:', error);
      Alert.alert('Error', 'Failed to update item');
    }
  }

  async function handleRemove(id: string) {
    Alert.alert(
      'Remove Item',
      'Remove this item from your inventory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeInventoryItem(id);
              setInventory(prev => prev.filter(i => i.id !== id));
              setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
              });
            } catch (error) {
              console.error('Error removing item:', error);
              Alert.alert('Error', 'Failed to remove item');
            }
          }
        }
      ]
    );
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredInventory = inventory.filter(item =>
    item.ingredient.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🥬</Text>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>What's in your kitchen?</Text>
          <Text style={styles.headerSubtitle}>
            {selectable
              ? 'Select ingredients to use this week'
              : 'Add ingredients you want to use this week'
            }
          </Text>
        </View>
      </View>

      {inventory.length > 0 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search inventory..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {filteredInventory.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'No matching items found'
              : 'No items in inventory\nAdd ingredients to get started'
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredInventory}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.ingredientId);
            return (
              <View style={styles.inventoryItem}>
                {selectable && (
                  <TouchableOpacity
                    style={[styles.checkbox, isSelected && styles.checkboxChecked]}
                    onPress={() => toggleSelection(item.ingredientId)}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                )}

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.ingredient.name}</Text>
                  <Text style={styles.itemAmount}>
                    {item.amount} {item.unit || ''}
                  </Text>
                  {item.ingredient.category && (
                    <Text style={styles.itemCategory}>{item.ingredient.category}</Text>
                  )}
                </View>

                <View style={styles.itemActions}>
                  {!selectable && (
                    <TouchableOpacity
                      style={[
                        styles.availableToggle,
                        !item.isAvailable && styles.unavailable
                      ]}
                      onPress={() => handleToggleAvailable(item)}
                    >
                      <Text style={styles.availableText}>
                        {item.isAvailable ? 'Available' : 'Used'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemove(item.id)}
                  >
                    <Text style={styles.removeIcon}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          style={styles.list}
        />
      )}

      {selectable && selectedIds.size > 0 && (
        <View style={styles.selectionSummary}>
          <Text style={styles.selectionText}>
            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    marginBottom: 16,
  },
  headerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#558B2F',
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  list: {
    flex: 1,
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  itemAmount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 12,
    color: '#999',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  availableToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  unavailable: {
    backgroundColor: '#FFEBEE',
  },
  availableText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2E7D32',
  },
  removeButton: {
    padding: 4,
  },
  removeIcon: {
    fontSize: 24,
    color: '#999',
    fontWeight: 'bold',
  },
  selectionSummary: {
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderTopWidth: 1,
    borderTopColor: '#C8E6C9',
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
});
