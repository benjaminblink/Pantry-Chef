import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getUserInventory, removeInventoryItem, getMealPlans } from '../src/api/mealPlanning';
import type { UserInventory, MealPlan } from '../src/types/mealPlanning';
import AddPantryItemModal from '../src/components/AddPantryItemModal';
import ScanReceiptModal from '../src/components/ScanReceiptModal';
import MealCompletionModal from '../src/components/MealCompletionModal';
import { completeMealPlan } from '../src/api/inventory';

export default function PantryScreen() {
  const [inventory, setInventory] = useState<UserInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [activeMealPlans, setActiveMealPlans] = useState<MealPlan[]>([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState<MealPlan | null>(null);
  const [completionModalVisible, setCompletionModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadInventory();
    }, [])
  );

  const loadInventory = async () => {
    try {
      setLoading(true);
      const items = await getUserInventory();
      setInventory(items);

      // Load active meal plans (current and upcoming)
      const plans = await getMealPlans(true, 10);
      const now = new Date();
      const activeOrRecent = plans.filter(plan => {
        const endDate = new Date(plan.endDate);
        const daysSinceEnd = Math.floor((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceEnd < 7; // Show plans that ended less than 7 days ago
      });
      setActiveMealPlans(activeOrRecent);
    } catch (error) {
      console.error('Error loading inventory:', error);
      Alert.alert('Error', 'Failed to load pantry');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInventory();
    setRefreshing(false);
  };

  const handleRemoveItem = (item: UserInventory) => {
    Alert.alert(
      'Remove Item',
      `Remove ${item.ingredient.name} from your pantry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeInventoryItem(item.id);
              setInventory(prev => prev.filter(i => i.id !== item.id));
            } catch (error) {
              console.error('Error removing item:', error);
              Alert.alert('Error', 'Failed to remove item');
            }
          }
        }
      ]
    );
  };

  const handleItemAdded = () => {
    setAddModalVisible(false);
    loadInventory();
  };

  const handleItemsScanned = () => {
    setScanModalVisible(false);
    loadInventory();
  };

  const handleOpenCompletionModal = (mealPlan: MealPlan) => {
    setSelectedMealPlan(mealPlan);
    setCompletionModalVisible(true);
  };

  const handleCompleteMeals = async (completedSlotIds: string[]) => {
    if (!selectedMealPlan) return;

    try {
      const result = await completeMealPlan(selectedMealPlan.id, completedSlotIds);

      // Show success message
      Alert.alert(
        'Meals Completed!',
        result.message,
        [{ text: 'OK' }]
      );

      // Reload data
      await loadInventory();
      setCompletionModalVisible(false);
      setSelectedMealPlan(null);
    } catch (error) {
      throw error; // Let MealCompletionModal handle the error
    }
  };

  const getMealPlanStatus = (mealPlan: MealPlan) => {
    const now = new Date();
    const startDate = new Date(mealPlan.startDate);
    const endDate = new Date(mealPlan.endDate);

    if (now < startDate) return 'upcoming';
    if (now > endDate) return 'ended';
    return 'active';
  };

  const filteredInventory = inventory.filter(item =>
    item.ingredient.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedInventory = filteredInventory.reduce((acc, item) => {
    const category = item.ingredient.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, UserInventory[]>);

  const getExpirationStatus = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const daysUntilExpiry = Math.floor(
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry < 0) return { label: 'Expired', color: '#EF4444' };
    if (daysUntilExpiry <= 3) return { label: `${daysUntilExpiry}d`, color: '#EF4444' };
    if (daysUntilExpiry <= 7) return { label: `${daysUntilExpiry}d`, color: '#F59E0B' };
    return null;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading pantry...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>🥬 My Pantry</Text>
            <Text style={styles.headerSubtitle}>
              {inventory.length} {inventory.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setScanModalVisible(true)}
            >
              <Text style={styles.scanButtonText}>📸</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setAddModalVisible(true)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Active Meal Plans Section */}
        {activeMealPlans.length > 0 && (
          <View style={styles.mealPlansSection}>
            <Text style={styles.sectionTitle}>Active Meal Plans</Text>
            {activeMealPlans.map(plan => {
              const status = getMealPlanStatus(plan);
              const incompleteMeals = plan.mealSlots?.filter(slot => !slot.isCompleted && slot.recipe) || [];

              return (
                <View key={plan.id} style={styles.mealPlanCard}>
                  <View style={styles.mealPlanHeader}>
                    <View style={styles.mealPlanInfo}>
                      <Text style={styles.mealPlanName}>{plan.name}</Text>
                      <Text style={styles.mealPlanDate}>
                        {new Date(plan.startDate).toLocaleDateString()} - {new Date(plan.endDate).toLocaleDateString()}
                      </Text>
                    </View>
                    {status === 'ended' && incompleteMeals.length > 0 && (
                      <View style={styles.endedBadge}>
                        <Text style={styles.endedBadgeText}>Ended</Text>
                      </View>
                    )}
                    {status === 'active' && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    )}
                  </View>

                  {incompleteMeals.length > 0 ? (
                    <>
                      <Text style={styles.mealPlanSummary}>
                        {incompleteMeals.length} {incompleteMeals.length === 1 ? 'meal' : 'meals'} not yet marked as completed
                      </Text>
                      {status === 'ended' && (
                        <View style={styles.completionBanner}>
                          <Text style={styles.completionBannerText}>
                            📋 Your meal plan ended. Mark completed meals to update your pantry.
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.markCompleteButton}
                        onPress={() => handleOpenCompletionModal(plan)}
                      >
                        <Text style={styles.markCompleteButtonText}>Mark Meals as Completed</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.allCompletedText}>✓ All meals completed</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {inventory.length > 0 && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search pantry..."
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
                : 'Your pantry is empty'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setAddModalVisible(true)}
              >
                <Text style={styles.emptyButtonText}>Add Your First Item</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.categoriesContainer}>
            {Object.entries(groupedInventory).map(([category, items]) => (
              <View key={category} style={styles.categorySection}>
                <Text style={styles.categoryTitle}>{category}</Text>
                {items.map(item => {
                  const expirationStatus = getExpirationStatus(item.expiresAt);
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.ingredient.name}</Text>
                        <Text style={styles.itemAmount}>
                          {item.amount} {item.unit || ''}
                        </Text>
                      </View>
                      <View style={styles.itemActions}>
                        {expirationStatus && (
                          <View
                            style={[
                              styles.expirationBadge,
                              { backgroundColor: expirationStatus.color }
                            ]}
                          >
                            <Text style={styles.expirationText}>
                              {expirationStatus.label}
                            </Text>
                          </View>
                        )}
                        {!item.isAvailable && (
                          <View style={styles.unavailableBadge}>
                            <Text style={styles.unavailableText}>Used</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => handleRemoveItem(item)}
                        >
                          <Text style={styles.removeIcon}>×</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <AddPantryItemModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onItemAdded={handleItemAdded}
      />

      <ScanReceiptModal
        visible={scanModalVisible}
        onClose={() => setScanModalVisible(false)}
        onItemsAdded={handleItemsScanned}
      />

      {selectedMealPlan && (
        <MealCompletionModal
          visible={completionModalVisible}
          mealPlan={selectedMealPlan}
          onClose={() => {
            setCompletionModalVisible(false);
            setSelectedMealPlan(null);
          }}
          onComplete={handleCompleteMeals}
        />
      )}
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
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#10B981',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  scanButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  scanButtonText: {
    fontSize: 18,
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    padding: 20,
    paddingBottom: 10,
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
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
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
  categoriesContainer: {
    padding: 20,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expirationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  expirationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  unavailableBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  unavailableText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '500',
  },
  removeButton: {
    padding: 4,
  },
  removeIcon: {
    fontSize: 28,
    color: '#999',
    fontWeight: 'bold',
  },
  mealPlansSection: {
    padding: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  mealPlanCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mealPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  mealPlanInfo: {
    flex: 1,
  },
  mealPlanName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  mealPlanDate: {
    fontSize: 12,
    color: '#666',
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  endedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  endedBadgeText: {
    color: '#CA8A04',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mealPlanSummary: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  completionBanner: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  completionBannerText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  markCompleteButton: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  markCompleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  allCompletedText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
});
