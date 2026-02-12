import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { getMealPlans } from '../src/api/mealPlanning';
import type { MealPlan } from '../src/types/mealPlanning';

export default function MealPlansScreen() {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchMealPlans();
  }, []);

  const fetchMealPlans = async () => {
    if (!isAuthenticated || !token) {
      Alert.alert('Error', 'You must be logged in to view meal plans');
      router.push('/login');
      return;
    }

    try {
      setRefreshing(true);
      const plans = await getMealPlans(true, 20, 0);
      setMealPlans(plans);
    } catch (error) {
      console.error('Fetch meal plans error:', error);
      Alert.alert(
        'Connection Error',
        'Could not connect to server. Make sure Docker containers are running.'
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const handlePlanPress = (planId: string) => {
    router.push(`/meal-plan/${planId}`);
  };

  const renderPlanCard = ({ item }: { item: MealPlan }) => {
    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);

    return (
      <TouchableOpacity
        style={styles.planCard}
        onPress={() => handlePlanPress(item.id)}
      >
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{item.name}</Text>
          {item.isActive && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeText}>Active</Text>
            </View>
          )}
        </View>

        <Text style={styles.planDate}>
          {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
        </Text>

        <View style={styles.planStats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.mealSlots.length}</Text>
            <Text style={styles.statLabel}>meals</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.existingRecipeCount}</Text>
            <Text style={styles.statLabel}>existing</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.newRecipeCount}</Text>
            <Text style={styles.statLabel}>new</Text>
          </View>
        </View>

        {item.calorieTargetPerDay && (
          <Text style={styles.targetText}>
            Target: {item.calorieTargetPerDay} cal/day
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>My Meal Plans</Text>
            <Text style={styles.headerSubtitle}>
              {mealPlans.length} total plans
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/meal-planner')}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {refreshing && mealPlans.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color="#AF52DE" />
      ) : mealPlans.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No meal plans yet</Text>
          <Text style={styles.emptySubtext}>
            Create your first meal plan to get started
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/meal-planner')}
          >
            <Text style={styles.primaryButtonText}>Create Meal Plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={mealPlans}
          renderItem={renderPlanCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={fetchMealPlans}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
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
  header: {
    backgroundColor: '#AF52DE',
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
    color: '#AF52DE',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
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
    marginBottom: 30,
  },
  primaryButton: {
    backgroundColor: '#AF52DE',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 15,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  activeBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeText: {
    fontSize: 10,
    color: 'white',
    fontWeight: 'bold',
  },
  planDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  planStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 8,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#AF52DE',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  targetText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});
