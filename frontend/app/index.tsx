import { Text, View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Link, router, useFocusEffect } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { useCredits } from "../contexts/CreditContext";
import { useSubscription } from "../contexts/SubscriptionContext";
import { useEffect, useCallback, useState } from "react";
import ImportRecipeModal from "../src/components/ImportRecipeModal";

export default function Index() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const { balance, refreshBalance } = useCredits();
  const { isProUser } = useSubscription();
  const [importModalVisible, setImportModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) refreshBalance();
    }, [isAuthenticated])
  );

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Pantry Chef</Text>
            <Text style={styles.subtitle}>Plan, Cook, Enjoy</Text>
            {user && (
              <Text style={styles.welcomeText}>Welcome, {user.name || user.email}!</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {balance !== null && (
              <TouchableOpacity
                onPress={() => router.push('/settings')}
                style={styles.creditPill}
              >
                <Text style={styles.creditPillIcon}>●</Text>
                <Text style={styles.creditPillText}>{balance}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.menuContainer}>
        <View style={styles.row}>
          <Link href="/recipes" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.primaryButton]}>
              <Text style={styles.menuIcon}>🍳</Text>
              <Text style={styles.menuButtonText}>Browse Recipes</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/add-recipe" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.primaryButton]}>
              <Text style={styles.menuIcon}>➕</Text>
              <Text style={styles.menuButtonText}>Add Recipe</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.row}>
          <Link href="/ingredients" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.secondaryButton]}>
              <Text style={styles.menuIcon}>🥬</Text>
              <Text style={styles.menuButtonText}>Ingredients</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/add-ingredient" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.secondaryButton]}>
              <Text style={styles.menuIcon}>🌱</Text>
              <Text style={styles.menuButtonText}>Add Ingredient</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.row}>
          <Link href="/meal-planner" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.plannerButton]}>
              <Text style={styles.menuIcon}>🗓️</Text>
              <Text style={styles.menuButtonText}>Meal Planner</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/meal-plans" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.plannerButton]}>
              <Text style={styles.menuIcon}>📋</Text>
              <Text style={styles.menuButtonText}>My Plans</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.row}>
          <Link href="/pantry" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.pantryButton]}>
              <View style={styles.buttonContent}>
                <Text style={styles.menuIcon}>🥬</Text>
                <Text style={styles.menuButtonText}>My Pantry</Text>
                {!isProUser && <Text style={styles.proBadge}>PRO</Text>}
              </View>
            </TouchableOpacity>
          </Link>

          <Link href="/quick-cook" asChild style={styles.halfButton}>
            <TouchableOpacity style={[styles.menuButton, styles.quickCookButton]}>
              <View style={styles.buttonContent}>
                <Text style={styles.menuIcon}>👨‍🍳</Text>
                <Text style={styles.menuButtonText}>Quick Cook</Text>
                {!isProUser && <Text style={styles.proBadge}>PRO</Text>}
              </View>
            </TouchableOpacity>
          </Link>
        </View>

        <TouchableOpacity
          style={[styles.menuButton, styles.importButton]}
          onPress={() => setImportModalVisible(true)}
        >
          <Text style={styles.menuIcon}>🔗</Text>
          <Text style={styles.menuButtonText}>Import from URL</Text>
          <Text style={styles.menuButtonSubtext}>Import recipe from any website (1 credit)</Text>
        </TouchableOpacity>

        <Link href="/shopping-cart" asChild>
          <TouchableOpacity style={[styles.menuButton, styles.cartButton]}>
            <Text style={styles.menuIcon}>🛒</Text>
            <Text style={styles.menuButtonText}>Shopping Cart</Text>
            <Text style={styles.menuButtonSubtext}>Order ingredients from Walmart</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/chatbot" asChild>
          <TouchableOpacity style={[styles.menuButton, styles.chatButton]}>
            <Text style={styles.menuIcon}>💬</Text>
            <Text style={styles.menuButtonText}>Chat Assistant</Text>
            <Text style={styles.menuButtonSubtext}>Ask me anything about cooking!</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <ImportRecipeModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        clearCartOnImport={false}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  contentContainer: {
    paddingBottom: 30,
  },
  header: {
    backgroundColor: "#007AFF",
    padding: 30,
    paddingTop: 80,
    paddingBottom: 30,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "rgba(255, 255, 255, 0.9)",
  },
  welcomeText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 8,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  creditPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    gap: 6,
  },
  creditPillIcon: {
    color: "#FFD700",
    fontSize: 12,
  },
  creditPillText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  logoutButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  menuContainer: {
    padding: 20,
  },
  row: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 15,
  },
  halfButton: {
    flex: 1,
  },
  menuButton: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    marginBottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 120,
    justifyContent: "center",
  },
  primaryButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  secondaryButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#34C759",
  },
  plannerButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#AF52DE",
  },
  pantryButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  quickCookButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  cartButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#34C759",
  },
  chatButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#FF9500",
  },
  importButton: {
    borderLeftWidth: 4,
    borderLeftColor: "#5856D6",
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 10,
    textAlign: "center",
  },
  menuButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
    textAlign: "center",
  },
  menuButtonSubtext: {
    fontSize: 14,
    color: "#666",
  },
  buttonContent: {
    position: "relative",
    alignItems: "center",
  },
  proBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#FFD700",
    color: "#000",
    fontSize: 10,
    fontWeight: "bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
});
