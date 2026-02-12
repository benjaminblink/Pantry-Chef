import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import type { MealPlan, MealSlot, Recipe } from '../types/mealPlanning';

interface MealCompletionModalProps {
  visible: boolean;
  mealPlan: MealPlan & {
    mealSlots: (MealSlot & { recipe: Recipe | null })[];
  };
  onClose: () => void;
  onComplete: (completedSlotIds: string[]) => Promise<void>;
  onSkipSlots?: (slotIds: string[]) => Promise<void>;
}

type MealStatus = 'pending' | 'cooked' | 'skipped';

export default function MealCompletionModal({
  visible,
  mealPlan,
  onClose,
  onComplete,
  onSkipSlots
}: MealCompletionModalProps) {
  // Track status for each slot: 'pending' (default), 'cooked' (mark complete), 'skipped' (remove from plan)
  const [mealStatuses, setMealStatuses] = useState<Record<string, MealStatus>>(() => {
    const statuses: Record<string, MealStatus> = {};
    mealPlan.mealSlots
      .filter(slot => !slot.isCompleted && slot.recipe)
      .forEach(slot => {
        statuses[slot.id] = 'pending';
      });
    return statuses;
  });
  const [loading, setLoading] = useState(false);

  const setMealStatus = (slotId: string, status: MealStatus) => {
    setMealStatuses(prev => ({
      ...prev,
      [slotId]: status
    }));
  };

  const handleConfirm = async () => {
    const cookedSlots = Object.entries(mealStatuses)
      .filter(([_, status]) => status === 'cooked')
      .map(([slotId]) => slotId);

    const skippedSlots = Object.entries(mealStatuses)
      .filter(([_, status]) => status === 'skipped')
      .map(([slotId]) => slotId);

    if (cookedSlots.length === 0 && skippedSlots.length === 0) {
      Alert.alert('No Changes', 'Please mark at least one meal as cooked or didn\'t cook.');
      return;
    }

    try {
      setLoading(true);

      // First, mark cooked meals as complete (this will deduct from pantry)
      if (cookedSlots.length > 0) {
        await onComplete(cookedSlots);
      }

      // Then, mark skipped meals (preserves meal plan for future reference)
      if (skippedSlots.length > 0 && onSkipSlots) {
        await onSkipSlots(skippedSlots);
      }

      onClose();
    } catch (error) {
      console.error('Error updating meals:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to update meals'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDidntCookAny = () => {
    Alert.alert(
      'Didn\'t Cook Any Meals?',
      'This will mark all incomplete meals as skipped. Your meal plan will be preserved for future reference.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Skipped',
          style: 'destructive',
          onPress: async () => {
            const allSlotIds = Object.keys(mealStatuses);
            if (allSlotIds.length > 0 && onSkipSlots) {
              try {
                setLoading(true);
                await onSkipSlots(allSlotIds);
                onClose();
              } catch (error) {
                Alert.alert('Error', 'Failed to mark meals as skipped');
              } finally {
                setLoading(false);
              }
            }
          }
        }
      ]
    );
  };

  // Group slots by day
  const slotsByDay = mealPlan.mealSlots.reduce((acc, slot) => {
    if (!slot.recipe || slot.isCompleted) return acc;

    const dateKey = new Date(slot.date).toLocaleDateString();
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(slot);
    return acc;
  }, {} as Record<string, (MealSlot & { recipe: Recipe | null })[]>);

  const getMealTypeEmoji = (mealType: string) => {
    switch (mealType.toLowerCase()) {
      case 'breakfast': return '🍳';
      case 'lunch': return '🥗';
      case 'dinner': return '🍽️';
      case 'snack': return '🍎';
      default: return '🍴';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Mark Meals as Completed</Text>
            <Text style={styles.headerSubtitle}>
              {mealPlan.name}
            </Text>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            {Object.keys(slotsByDay).length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✓</Text>
                <Text style={styles.emptyText}>
                  All meals in this plan have been completed!
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.instruction}>
                  Select the meals you've completed. Ingredients will be deducted from your pantry.
                </Text>

                {Object.entries(slotsByDay).map(([dateKey, slots]) => (
                  <View key={dateKey} style={styles.daySection}>
                    <Text style={styles.dayTitle}>{dateKey}</Text>
                    {slots.map(slot => {
                      const status = mealStatuses[slot.id] || 'pending';
                      return (
                        <View key={slot.id} style={styles.mealCard}>
                          <View style={styles.mealInfo}>
                            <View style={styles.mealHeader}>
                              <Text style={styles.mealEmoji}>
                                {getMealTypeEmoji(slot.mealType)}
                              </Text>
                              <Text style={styles.mealType}>
                                {slot.mealType.charAt(0).toUpperCase() + slot.mealType.slice(1)}
                              </Text>
                            </View>
                            <Text style={styles.recipeName}>{slot.recipe?.title}</Text>
                          </View>

                          <View style={styles.statusButtons}>
                            <TouchableOpacity
                              style={[
                                styles.statusButton,
                                status === 'cooked' && styles.statusButtonActive
                              ]}
                              onPress={() => setMealStatus(slot.id, 'cooked')}
                            >
                              <Text style={[
                                styles.statusButtonText,
                                status === 'cooked' && styles.statusButtonTextActive
                              ]}>✓ Cooked</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.statusButton,
                                styles.statusButtonSkip,
                                status === 'skipped' && styles.statusButtonSkipActive
                              ]}
                              onPress={() => setMealStatus(slot.id, 'skipped')}
                            >
                              <Text style={[
                                styles.statusButtonText,
                                styles.statusButtonSkipText,
                                status === 'skipped' && styles.statusButtonSkipTextActive
                              ]}>✕ Didn't Cook</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                loading && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  Confirm
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  instruction: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  daySection: {
    marginBottom: 24,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  mealCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#10B981',
  },
  statusButtonSkip: {
    borderColor: '#EF4444',
  },
  statusButtonSkipActive: {
    backgroundColor: '#EF4444',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  statusButtonTextActive: {
    color: 'white',
  },
  statusButtonSkipText: {
    color: '#EF4444',
  },
  statusButtonSkipTextActive: {
    color: 'white',
  },
  mealInfo: {
    flex: 1,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  mealEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  mealType: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  recipeName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#ccc',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
