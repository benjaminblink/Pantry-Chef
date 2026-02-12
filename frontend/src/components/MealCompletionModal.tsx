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
}

export default function MealCompletionModal({
  visible,
  mealPlan,
  onClose,
  onComplete
}: MealCompletionModalProps) {
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(
    new Set(
      mealPlan.mealSlots
        .filter(slot => !slot.isCompleted && slot.recipe)
        .map(slot => slot.id)
    )
  );
  const [loading, setLoading] = useState(false);

  const handleToggleSlot = (slotId: string) => {
    const newSelection = new Set(selectedSlots);
    if (newSelection.has(slotId)) {
      newSelection.delete(slotId);
    } else {
      newSelection.add(slotId);
    }
    setSelectedSlots(newSelection);
  };

  const handleConfirm = async () => {
    if (selectedSlots.size === 0) {
      Alert.alert('No Meals Selected', 'Please select at least one meal to complete.');
      return;
    }

    try {
      setLoading(true);
      await onComplete(Array.from(selectedSlots));
      onClose();
    } catch (error) {
      console.error('Error completing meals:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to complete meals'
      );
    } finally {
      setLoading(false);
    }
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
                    {slots.map(slot => (
                      <TouchableOpacity
                        key={slot.id}
                        style={styles.mealRow}
                        onPress={() => handleToggleSlot(slot.id)}
                      >
                        <View style={styles.checkboxContainer}>
                          <View style={[
                            styles.checkbox,
                            selectedSlots.has(slot.id) && styles.checkboxChecked
                          ]}>
                            {selectedSlots.has(slot.id) && (
                              <Text style={styles.checkmark}>✓</Text>
                            )}
                          </View>
                        </View>
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
                      </TouchableOpacity>
                    ))}
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
                (loading || selectedSlots.size === 0) && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={loading || selectedSlots.size === 0}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  Complete {selectedSlots.size} {selectedSlots.size === 1 ? 'Meal' : 'Meals'}
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
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkmark: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
