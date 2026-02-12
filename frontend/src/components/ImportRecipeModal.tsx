import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCredits } from '../../contexts/CreditContext';
import { API_URL } from '../../config';

interface ImportRecipeModalProps {
  visible: boolean;
  onClose: () => void;
  clearCartOnImport?: boolean;
  onImportSuccess?: (recipeId: string) => void;
}

export default function ImportRecipeModal({
  visible,
  onClose,
  clearCartOnImport = true,
  onImportSuccess,
}: ImportRecipeModalProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { balance, refreshBalance } = useCredits();

  const handleImport = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a valid URL');
      return;
    }

    // Validate URL format
    try {
      new URL(url.trim());
    } catch (e) {
      Alert.alert('Invalid URL', 'Please enter a valid recipe URL (e.g., https://allrecipes.com/...)');
      return;
    }

    // Check credit balance
    if (balance !== null && balance < 1) {
      Alert.alert(
        'Insufficient Credits',
        'You need 1 credit to import a recipe. Purchase credits or upgrade to Pro to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Credits',
            onPress: () => {
              onClose();
              navigation.navigate('paywall' as never);
            },
          },
        ]
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL.replace('/api', '')}/api/recipes/import-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          Alert.alert(
            'Insufficient Credits',
            `You need ${data.data?.required || 1} credit(s) to import a recipe.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Buy Credits',
                onPress: () => {
                  onClose();
                  navigation.navigate('paywall' as never);
                },
              },
            ]
          );
          return;
        }

        throw new Error(data.message || 'Failed to import recipe');
      }

      // Refresh credit balance
      await refreshBalance();

      // Success
      const recipeId = data.data.recipe.id;
      const newBalance = data.data.balance;

      onClose();
      setUrl('');

      if (onImportSuccess) {
        onImportSuccess(recipeId);
      }

      Alert.alert(
        'Recipe Imported!',
        data.usedCache
          ? `Recipe imported from cache successfully! (1 credit)\n\nNew balance: ${newBalance} credits`
          : `Recipe imported successfully! (1 credit)\n\nNew balance: ${newBalance} credits`,
        [
          {
            text: 'View Recipe',
            onPress: () => {
              router.push(`/recipe/${recipeId}`);
            },
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
    } catch (error: any) {
      console.error('Import error:', error);
      Alert.alert('Import Failed', error.message || 'Failed to import recipe from URL. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getAuthToken = async () => {
    const AsyncStorage = await import('@react-native-async-storage/async-storage').then(m => m.default);
    return AsyncStorage.getItem('authToken');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Import Recipe from URL</Text>

          <Text style={styles.disclaimer}>
            Import recipes for personal use only. Imported recipes remain private and cannot be made public.
            Original recipe source is attributed and linked for reference.
          </Text>

          <Text style={styles.cost}>Cost: 1 credit</Text>
          {balance !== null && (
            <Text style={styles.balance}>Your balance: {balance} credits</Text>
          )}

          <TextInput
            style={styles.input}
            placeholder="https://allrecipes.com/recipe/..."
            placeholderTextColor="#999"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!loading}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => {
                onClose();
                setUrl('');
              }}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.importButton, loading && styles.buttonDisabled]}
              onPress={handleImport}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importButtonText}>Import Recipe</Text>
              )}
            </TouchableOpacity>
          </View>

          {clearCartOnImport && (
            <Text style={styles.clearNote}>
              Note: Importing will clear your current cart
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  disclaimer: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  cost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90E2',
    marginBottom: 4,
  },
  balance: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  importButton: {
    backgroundColor: '#4A90E2',
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  clearNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
