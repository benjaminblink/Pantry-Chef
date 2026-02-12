import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { AdaptivePreferenceControls } from '../../src/components/AdaptivePreferenceControls';
import { InventoryManager } from '../../src/components/InventoryManager';
import { RecipeMixSlider } from '../../src/components/RecipeMixSlider';
import {
  getUserPreferences,
  updatePreference,
  deletePreference,
  checkPreferenceConflicts,
  generateRecipeIdeas,
  generateWeeklyMealPlan
} from '../../src/api/mealPlanning';
import type { UserPreference, ConflictWarning } from '../../src/types/mealPlanning';

interface RecipeIdea {
  title: string;
  description: string;
  mealType: string;
  promptVariation: string;
}

export default function MealPlannerPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Generation parameters
  const [startDate, setStartDate] = useState(new Date());
  const [daysToGenerate, setDaysToGenerate] = useState(7);
  const [mealsPerDay, setMealsPerDay] = useState<string[]>(['breakfast', 'lunch', 'dinner']);
  const [recipeMixRatio, setRecipeMixRatio] = useState(0.4); // 40% existing, 60% new
  const [useInventory, setUseInventory] = useState(false);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);
  const [showInventory, setShowInventory] = useState(false);

  // Recipe ideas review
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [recipeIdeas, setRecipeIdeas] = useState<RecipeIdea[]>([]);
  const [approvedIdeas, setApprovedIdeas] = useState<Set<number>>(new Set());

  async function loadData() {
    try {
      setLoading(true);
      const [prefs, conflictList] = await Promise.all([
        getUserPreferences(undefined, true),
        checkPreferenceConflicts()
      ]);
      setPreferences(prefs || []);
      setConflicts(conflictList || []);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load preferences');
      setPreferences([]);
      setConflicts([]);
    } finally {
      setLoading(false);
    }
  }

  // Reload data whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Update daysToGenerate when preferences change
  useEffect(() => {
    const daysPref = preferences.find(p => p.key === 'lifestyle_days_to_plan');
    if (daysPref && typeof daysPref.value === 'number') {
      setDaysToGenerate(daysPref.value);
    }
  }, [preferences]);

  async function handleUpdatePreference(id: string, value: any) {
    try {
      const updated = await updatePreference(id, { value });
      setPreferences(prev =>
        prev.map(p => p.id === id ? updated : p)
      );
      // Recheck conflicts
      const conflictList = await checkPreferenceConflicts();
      setConflicts(conflictList);
    } catch (error) {
      console.error('Error updating preference:', error);
      Alert.alert('Error', 'Failed to update preference');
    }
  }

  async function handleDeletePreference(id: string) {
    try {
      await deletePreference(id);
      setPreferences(prev => prev.filter(p => p.id !== id));
      // Recheck conflicts
      const conflictList = await checkPreferenceConflicts();
      setConflicts(conflictList);
    } catch (error) {
      console.error('Error deleting preference:', error);
      Alert.alert('Error', 'Failed to delete preference');
    }
  }

  async function handleGenerate() {
    // Check for conflicts
    if (conflicts.length > 0) {
      Alert.alert(
        'Preference Conflicts',
        conflicts.map(c => c.message).join('\n\n') + '\n\nGenerate anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Generate Anyway', onPress: () => generateIdeas() }
        ]
      );
      return;
    }

    generateIdeas();
  }

  async function generateIdeas() {
    try {
      setGenerating(true);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + daysToGenerate - 1);

      const params = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        mealsPerDay: mealsPerDay.length,
        mealTypes: mealsPerDay as ('breakfast' | 'lunch' | 'dinner' | 'snack')[],
        existingRecipeRatio: recipeMixRatio,
        useInventory,
        inventoryIngredientIds: useInventory ? selectedInventoryIds : undefined,
        matchUserStyle: true,
        preferenceIds: preferences.map(p => p.id)
      };

      // If using 100% existing recipes, skip the approval modal and generate directly
      if (recipeMixRatio >= 1.0) {
        console.log('Using 100% existing recipes - skipping idea approval');
        const result = await generateWeeklyMealPlan(params);

        Alert.alert(
          'Meal Plan Generated!',
          `Created plan with ${result.usedRecipes} existing recipes.`,
          [
            {
              text: 'View Plan',
              onPress: () => router.push(`/meal-plan/${result.mealPlan.id}`)
            }
          ]
        );
        return;
      }

      console.log('Generating recipe ideas with params:', params);

      const result = await generateRecipeIdeas(params);

      // Show all ideas as approved by default
      setRecipeIdeas(result.ideas);
      setApprovedIdeas(new Set(result.ideas.map((_, i) => i)));
      setShowReviewModal(true);
    } catch (error) {
      console.error('Error generating ideas:', error);
      if (error instanceof Error && error.message === 'INSUFFICIENT_CREDITS') return;
      Alert.alert(
        'Generation Failed',
        error instanceof Error ? error.message : 'Failed to generate recipe ideas'
      );
    } finally {
      setGenerating(false);
    }
  }

  function toggleIdeaApproval(index: number) {
    setApprovedIdeas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }

  async function generateFromApprovedIdeas() {
    try {
      setShowReviewModal(false);
      setGenerating(true);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + daysToGenerate - 1);

      // Filter only approved ideas
      const approvedRecipeIdeas = recipeIdeas.filter((_, index) => approvedIdeas.has(index));

      const params = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        mealsPerDay: mealsPerDay.length,
        mealTypes: mealsPerDay as ('breakfast' | 'lunch' | 'dinner' | 'snack')[],
        existingRecipeRatio: recipeMixRatio,
        useInventory,
        inventoryIngredientIds: useInventory ? selectedInventoryIds : undefined,
        matchUserStyle: true,
        preferenceIds: preferences.map(p => p.id),
        approvedIdeas: approvedRecipeIdeas
      };

      console.log('Generating meal plan with approved ideas:', approvedRecipeIdeas);

      const result = await generateWeeklyMealPlan(params);

      Alert.alert(
        'Meal Plan Generated!',
        `Created plan with ${result.usedRecipes} existing and ${result.newRecipes} new recipes.\n${result.newIngredients.length} new ingredients added.`,
        [
          {
            text: 'View Plan',
            onPress: () => router.push(`/meal-plan/${result.mealPlan.id}`)
          }
        ]
      );
    } catch (error) {
      console.error('Error generating meal plan:', error);
      if (error instanceof Error && error.message === 'INSUFFICIENT_CREDITS') return;
      Alert.alert(
        'Generation Failed',
        error instanceof Error ? error.message : 'Failed to generate meal plan'
      );
    } finally {
      setGenerating(false);
    }
  }

  const totalMeals = daysToGenerate * mealsPerDay.length;
  const canGenerate = preferences.length > 0 && mealsPerDay.length > 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍽️ Plan Your Week</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/settings/meal-preferences')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Conflicts Warning */}
        {conflicts.length > 0 && (
          <View style={styles.conflictsWarning}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>
                {conflicts.length} Potential Conflict{conflicts.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.warningMessage}>
                {conflicts[0].message}
                {conflicts.length > 1 && ` (+${conflicts.length - 1} more)`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={() => Alert.alert('Conflicts Detected', conflicts.map(c => c.message).join('\n\n'))}
            >
              <Text style={styles.reviewButtonText}>Review</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active Preferences */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Preferences</Text>
            {preferences.length === 0 && (
              <TouchableOpacity onPress={() => router.push('/settings/meal-preferences')}>
                <Text style={styles.addLink}>+ Add preferences</Text>
              </TouchableOpacity>
            )}
          </View>

          <AdaptivePreferenceControls
            preferences={preferences}
            onUpdate={handleUpdatePreference}
            onDelete={handleDeletePreference}
          />
        </View>

        {/* Recipe Mix Slider */}
        <View style={styles.section}>
          <RecipeMixSlider
            value={recipeMixRatio}
            totalMeals={totalMeals}
            onChange={setRecipeMixRatio}
          />
        </View>

        {/* Inventory Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.inventoryToggle}
            onPress={() => setUseInventory(!useInventory)}
          >
            <View style={[styles.checkbox, useInventory && styles.checkboxChecked]}>
              {useInventory && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.inventoryToggleText}>
              Use ingredients I already have
            </Text>
          </TouchableOpacity>

          {useInventory && (
            <View style={styles.inventoryContainer}>
              <InventoryManager
                selectable
                onSelectionChange={setSelectedInventoryIds}
              />
            </View>
          )}
        </View>

        {/* Meal Types Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meals per Day</Text>
          <View style={styles.mealTypesContainer}>
            {['breakfast', 'lunch', 'dinner', 'snack'].map(mealType => {
              const isSelected = mealsPerDay.includes(mealType);
              return (
                <TouchableOpacity
                  key={mealType}
                  style={[styles.mealTypeChip, isSelected && styles.mealTypeChipActive]}
                  onPress={() => {
                    setMealsPerDay(prev =>
                      isSelected
                        ? prev.filter(m => m !== mealType)
                        : [...prev, mealType]
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.mealTypeText,
                      isSelected && styles.mealTypeTextActive
                    ]}
                  >
                    {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Plan Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration:</Text>
            <Text style={styles.summaryValue}>{daysToGenerate} days</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total meals:</Text>
            <Text style={styles.summaryValue}>{totalMeals} meals</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Preferences:</Text>
            <Text style={styles.summaryValue}>{preferences.length} active</Text>
          </View>
        </View>
      </ScrollView>

      {/* Generate Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.generateButton, !canGenerate && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={!canGenerate || generating}
        >
          {generating ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.generateButtonText}>
              Generate Meal Plan  <Text style={{ fontWeight: 'normal', fontSize: 13, opacity: 0.8 }}>· 1 credit</Text>
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Recipe Ideas Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Review Recipe Ideas</Text>
            <TouchableOpacity onPress={() => setShowReviewModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalSubheader}>
            <Text style={styles.modalSubtext}>
              {approvedIdeas.size} of {recipeIdeas.length} recipes selected
            </Text>
            <Text style={styles.modalInstruction}>
              Tap X to remove recipes you don't want
            </Text>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {recipeIdeas.map((idea, index) => {
              const isApproved = approvedIdeas.has(index);
              const mealIcon =
                idea.mealType === 'breakfast' ? '🍳' :
                idea.mealType === 'lunch' ? '🥗' :
                idea.mealType === 'dinner' ? '🍽️' : '🍎';

              return (
                <View
                  key={index}
                  style={[
                    styles.ideaCard,
                    !isApproved && styles.ideaCardRemoved
                  ]}
                >
                  <View style={styles.ideaHeader}>
                    <View style={styles.ideaHeaderLeft}>
                      <Text style={styles.ideaMealIcon}>{mealIcon}</Text>
                      <Text style={styles.ideaMealType}>
                        {idea.mealType.toUpperCase()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => toggleIdeaApproval(index)}
                    >
                      <Text style={styles.removeButtonText}>
                        {isApproved ? '✕' : '↶'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.ideaTitle}>{idea.title}</Text>
                  <Text style={styles.ideaDescription}>{idea.description}</Text>
                </View>
              );
            })}

            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowReviewModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.acceptButton,
                approvedIdeas.size === 0 && styles.acceptButtonDisabled
              ]}
              onPress={generateFromApprovedIdeas}
              disabled={approvedIdeas.size === 0}
            >
              <Text style={styles.acceptButtonText}>
                Generate {approvedIdeas.size} Recipe{approvedIdeas.size !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  addLink: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  conflictsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 4,
  },
  warningMessage: {
    fontSize: 13,
    color: '#666',
  },
  reviewButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reviewButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  inventoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
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
  inventoryToggleText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  inventoryContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    maxHeight: 300,
  },
  mealTypesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealTypeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: 'white',
  },
  mealTypeChipActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  mealTypeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  mealTypeTextActive: {
    color: 'white',
  },
  summary: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  generateButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  generateButtonDisabled: {
    backgroundColor: '#ccc',
  },
  generateButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
  modalSubheader: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalSubtext: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 4,
  },
  modalInstruction: {
    fontSize: 13,
    color: '#666',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  ideaCard: {
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
  ideaCardRemoved: {
    opacity: 0.4,
    backgroundColor: '#f5f5f5',
  },
  ideaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ideaHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ideaMealIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  ideaMealType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.5,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  ideaTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  ideaDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptButtonDisabled: {
    backgroundColor: '#ccc',
  },
  acceptButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
