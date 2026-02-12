import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { PreferenceControl } from './PreferenceControl';
import type { UserPreference } from '../types/mealPlanning';

interface Props {
  preferences: UserPreference[];
  onUpdate: (preferenceId: string, newValue: any) => void;
  onDelete?: (preferenceId: string) => void;
  showDelete?: boolean;
}

const CATEGORY_ICONS = {
  dietary: '🍴',
  nutrition: '🥗',
  budget: '💰',
  cuisine: '🌍',
  lifestyle: '⏱️',
  restrictions: '🚫'
};

const CATEGORY_NAMES = {
  dietary: 'Dietary',
  nutrition: 'Nutrition',
  budget: 'Budget',
  cuisine: 'Cuisine',
  lifestyle: 'Lifestyle',
  restrictions: 'Restrictions'
};

export function AdaptivePreferenceControls({
  preferences,
  onUpdate,
  onDelete,
  showDelete = true
}: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['dietary', 'nutrition']) // Start with these expanded
  );

  // Group preferences by category
  const grouped = preferences.reduce((acc, pref) => {
    if (!acc[pref.category]) {
      acc[pref.category] = [];
    }
    acc[pref.category].push(pref);
    return acc;
  }, {} as Record<string, UserPreference[]>);

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

  if (preferences.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No preferences set</Text>
        <Text style={styles.emptyMessage}>
          Add preferences from settings to customize your meal plans
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Object.entries(grouped).map(([category, categoryPrefs]) => {
        const isExpanded = expandedCategories.has(category);
        const icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || '📋';
        const name = CATEGORY_NAMES[category as keyof typeof CATEGORY_NAMES] || category;

        // Sort preferences: pinned first, then by sortOrder
        const sortedPrefs = [...categoryPrefs].sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });

        return (
          <View key={category} style={styles.category}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => toggleCategory(category)}
            >
              <View style={styles.categoryTitleRow}>
                <Text style={styles.categoryIcon}>{icon}</Text>
                <Text style={styles.categoryTitle}>{name}</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{categoryPrefs.length}</Text>
                </View>
              </View>
              <Text style={styles.categoryToggle}>{isExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.categoryContent}>
                {sortedPrefs.map(pref => (
                  <View key={pref.id} style={styles.preferenceRow}>
                    {pref.isPinned && (
                      <View style={styles.pinnedIndicator}>
                        <Text style={styles.pinnedIcon}>📌</Text>
                      </View>
                    )}
                    <PreferenceControl
                      preference={pref}
                      onUpdate={(value) => onUpdate(pref.id, value)}
                      onDelete={onDelete ? () => onDelete(pref.id) : undefined}
                      showDelete={showDelete}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
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
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textTransform: 'uppercase',
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
    fontWeight: 'bold',
  },
  categoryContent: {
    padding: 16,
  },
  preferenceRow: {
    position: 'relative',
  },
  pinnedIndicator: {
    position: 'absolute',
    left: -8,
    top: 0,
    zIndex: 5,
  },
  pinnedIcon: {
    fontSize: 16,
  },
});
