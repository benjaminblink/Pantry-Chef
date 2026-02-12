import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { PreferenceControl } from '../../src/components/PreferenceControl';
import {
  getUserPreferences,
  getPreferenceLibrary,
  createPreferenceFromLibrary,
  updatePreference,
  deletePreference
} from '../../src/api/mealPlanning';
import type { UserPreference, PreferenceLibrary, PreferenceDefinition } from '../../src/types/mealPlanning';

const CATEGORY_ICONS = {
  dietary: '🍴',
  nutrition: '🥗',
  budget: '💰',
  cuisine: '🌍',
  lifestyle: '⏱️',
  restrictions: '🚫'
};

export default function MealPreferencesSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [library, setLibrary] = useState<PreferenceLibrary | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['dietary'])
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [prefs, lib] = await Promise.all([
        getUserPreferences(),
        getPreferenceLibrary()
      ]);
      setPreferences(prefs || []);
      setLibrary(lib || null);
    } catch (error) {
      console.error('Error loading preferences:', error);
      Alert.alert('Error', 'Failed to load preferences');
      setPreferences([]);
      setLibrary(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPreference(def: PreferenceDefinition) {
    try {
      await createPreferenceFromLibrary(def.key);
      // Force a complete refresh to ensure UI updates
      await loadData();
    } catch (error) {
      console.error('Error adding preference:', error);
      Alert.alert('Error', 'Failed to add preference');
    }
  }

  async function handleUpdatePreference(id: string, value: any) {
    try {
      const updated = await updatePreference(id, { value });
      setPreferences(prev =>
        prev.map(p => p.id === id ? updated : p)
      );
    } catch (error) {
      console.error('Error updating preference:', error);
      Alert.alert('Error', 'Failed to update preference');
    }
  }

  async function handleDeletePreference(id: string) {
    try {
      await deletePreference(id);
      setPreferences(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting preference:', error);
      Alert.alert('Error', 'Failed to delete preference');
    }
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const userPrefKeys = new Set((preferences || []).filter(p => p && p.key).map(p => p.key));

  const filterDefinitions = (defs: PreferenceDefinition[]) => {
    if (!searchQuery) return defs;
    const query = searchQuery.toLowerCase();
    return defs.filter(def =>
      def.label.toLowerCase().includes(query) ||
      def.description.toLowerCase().includes(query)
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  if (!library) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load preference library</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Preferences</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search preferences..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView style={styles.content}>
        {library && Object.entries(library).map(([categoryKey, categoryDefs]) => {
          const isExpanded = expandedCategories.has(categoryKey);
          const icon = CATEGORY_ICONS[categoryKey as keyof typeof CATEGORY_ICONS] || '📋';

          const userPrefs = preferences.filter(p => p && p.category === categoryKey);
          const filteredDefs = filterDefinitions(categoryDefs);
          const availableDefs = filteredDefs.filter(def => !userPrefKeys.has(def.key));

          return (
            <View key={categoryKey} style={styles.category}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(categoryKey)}
              >
                <View style={styles.categoryTitleRow}>
                  <Text style={styles.categoryIcon}>{icon}</Text>
                  <Text style={styles.categoryTitle}>
                    {categoryKey.toUpperCase()}
                  </Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>
                      {userPrefs.length}/{categoryDefs.length}
                    </Text>
                  </View>
                </View>
                <Text style={styles.categoryToggle}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.categoryContent}>
                  {/* Active preferences */}
                  {userPrefs.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Active:</Text>
                      {userPrefs.map(pref => (
                        <PreferenceControl
                          key={pref.id}
                          preference={pref}
                          onUpdate={(value) => handleUpdatePreference(pref.id, value)}
                          onDelete={() => handleDeletePreference(pref.id)}
                        />
                      ))}
                    </View>
                  )}

                  {/* Available preferences */}
                  {availableDefs.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Available:</Text>
                      {availableDefs.map(def => (
                        <TouchableOpacity
                          key={def.key}
                          style={styles.libraryOption}
                          onPress={() => handleAddPreference(def)}
                        >
                          <View style={styles.optionInfo}>
                            <Text style={styles.optionLabel}>{def.label}</Text>
                            <Text style={styles.optionDescription}>{def.description}</Text>
                          </View>
                          <View style={styles.addButton}>
                            <Text style={styles.addButtonText}>+ Add</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {availableDefs.length === 0 && userPrefs.length === 0 && (
                    <Text style={styles.noResults}>No preferences found</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.back()}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  category: {
    marginBottom: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 0.5,
  },
  categoryBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  categoryBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  categoryToggle: {
    fontSize: 16,
    color: '#666',
  },
  categoryContent: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  libraryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  optionInfo: {
    flex: 1,
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  noResults: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
