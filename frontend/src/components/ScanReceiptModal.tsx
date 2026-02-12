import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { scanReceipt, importReceiptItems, ReceiptItem, ReceiptImportItem } from '../api/inventory';
import { useCredits } from '../../contexts/CreditContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onItemsAdded: () => void;
}

interface EditableItem extends ReceiptItem {
  id: string;
  expiresAt?: Date;
}

export default function ScanReceiptModal({ visible, onClose, onItemsAdded }: Props) {
  const { balance, refreshBalance } = useCredits();
  const [step, setStep] = useState<'select' | 'processing' | 'review'>('select');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleTakePhoto = async () => {
    // Check credits first
    if (balance === null || balance < 1) {
      Alert.alert(
        'Insufficient Credits',
        'You need 1 credit to scan a receipt. Purchase credits or earn more by shopping at Walmart.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Request camera permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to scan receipts');
      return;
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true
    });

    if (!result.canceled && result.assets[0].base64) {
      processReceipt(result.assets[0].base64);
    }
  };

  const handleChooseFromLibrary = async () => {
    // Check credits first
    if (balance === null || balance < 1) {
      Alert.alert(
        'Insufficient Credits',
        'You need 1 credit to scan a receipt. Purchase credits or earn more by shopping at Walmart.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Request media library permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library permission is needed');
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true
    });

    if (!result.canceled && result.assets[0].base64) {
      processReceipt(result.assets[0].base64);
    }
  };

  const processReceipt = async (imageBase64: string) => {
    try {
      setStep('processing');
      setLoading(true);

      const response = await scanReceipt(imageBase64);

      // Convert to editable items with unique IDs
      const editableItems: EditableItem[] = response.items.map((item, index) => ({
        ...item,
        id: `item-${Date.now()}-${index}`
      }));

      setItems(editableItems);
      setStep('review');
      await refreshBalance();
    } catch (error) {
      console.error('Error scanning receipt:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to scan receipt');
      setStep('select');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = (id: string, field: keyof EditableItem, value: any) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddToPantry = async () => {
    if (items.length === 0) {
      Alert.alert('No Items', 'Add at least one item to your pantry');
      return;
    }

    try {
      setLoading(true);

      // Convert to import format
      const importItems: ReceiptImportItem[] = items.map(item => ({
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        expiresAt: item.expiresAt ? item.expiresAt.toISOString() : undefined
      }));

      const response = await importReceiptItems(importItems);

      Alert.alert(
        'Success',
        response.message,
        [{ text: 'OK', onPress: () => {
          resetModal();
          onItemsAdded();
        }}]
      );
    } catch (error) {
      console.error('Error importing items:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to add items to pantry');
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setStep('select');
    setItems([]);
    setLoading(false);
    setSelectedDateIndex(null);
    setShowDatePicker(false);
  };

  const handleClose = () => {
    if (step === 'review' && items.length > 0) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved items. Are you sure you want to close?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => {
            resetModal();
            onClose();
          }}
        ]
      );
    } else {
      resetModal();
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelButton}>
              {step === 'review' ? 'Cancel' : 'Close'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          {step === 'review' ? (
            <TouchableOpacity onPress={handleAddToPantry} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Text style={styles.addButton}>Add All</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>

        {/* Content */}
        {step === 'select' && (
          <View style={styles.selectContainer}>
            <Text style={styles.selectIcon}>📸</Text>
            <Text style={styles.selectTitle}>Scan Your Receipt</Text>
            <Text style={styles.selectSubtitle}>
              Use AI to extract items from your grocery receipt
            </Text>
            <Text style={styles.creditCost}>Costs 1 credit • You have {balance || 0}</Text>

            <TouchableOpacity
              style={styles.optionButton}
              onPress={handleTakePhoto}
            >
              <Text style={styles.optionIcon}>📷</Text>
              <Text style={styles.optionText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionButton}
              onPress={handleChooseFromLibrary}
            >
              <Text style={styles.optionIcon}>🖼️</Text>
              <Text style={styles.optionText}>Choose from Library</Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              ℹ️ AI extraction may not be 100% accurate. You'll be able to review and edit items before adding them to your pantry.
            </Text>
          </View>
        )}

        {step === 'processing' && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.processingText}>Analyzing receipt...</Text>
            <Text style={styles.processingSubtext}>This may take a few moments</Text>
          </View>
        )}

        {step === 'review' && (
          <ScrollView style={styles.reviewContainer}>
            <Text style={styles.reviewTitle}>Review & Edit Items</Text>
            <Text style={styles.reviewSubtitle}>
              {items.length} {items.length === 1 ? 'item' : 'items'} extracted
            </Text>

            {items.map((item, index) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemNumber}>#{index + 1}</Text>
                  <TouchableOpacity
                    style={styles.removeItemButton}
                    onPress={() => handleRemoveItem(item.id)}
                  >
                    <Text style={styles.removeItemIcon}>×</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.itemField}>
                  <Text style={styles.itemLabel}>Name</Text>
                  <TextInput
                    style={styles.itemInput}
                    value={item.name}
                    onChangeText={(text) => handleUpdateItem(item.id, 'name', text)}
                    placeholder="Ingredient name"
                  />
                </View>

                <View style={styles.itemRow}>
                  <View style={[styles.itemField, { flex: 1 }]}>
                    <Text style={styles.itemLabel}>Amount</Text>
                    <TextInput
                      style={styles.itemInput}
                      value={item.amount}
                      onChangeText={(text) => handleUpdateItem(item.id, 'amount', text)}
                      placeholder="1"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.itemField, { flex: 1, marginLeft: 12 }]}>
                    <Text style={styles.itemLabel}>Unit</Text>
                    <TextInput
                      style={styles.itemInput}
                      value={item.unit || ''}
                      onChangeText={(text) => handleUpdateItem(item.id, 'unit', text)}
                      placeholder="pieces"
                    />
                  </View>
                </View>

                <View style={styles.itemField}>
                  <Text style={styles.itemLabel}>Expiration Date (Optional)</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => {
                      setSelectedDateIndex(index);
                      setShowDatePicker(true);
                    }}
                  >
                    <Text style={styles.dateButtonText}>
                      {item.expiresAt
                        ? item.expiresAt.toLocaleDateString()
                        : 'Select date'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {items.length === 0 && (
              <View style={styles.emptyReview}>
                <Text style={styles.emptyReviewText}>
                  All items removed. Close to start over.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {showDatePicker && selectedDateIndex !== null && (
          <DateTimePicker
            value={items[selectedDateIndex].expiresAt || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selectedDate && selectedDateIndex !== null) {
                handleUpdateItem(items[selectedDateIndex].id, 'expiresAt', selectedDate);
              }
            }}
            minimumDate={new Date()}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666',
  },
  addButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  selectContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  selectIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  selectTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  selectSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  creditCost: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
    marginBottom: 32,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  optionIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  optionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 18,
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  processingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 24,
  },
  processingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  reviewContainer: {
    flex: 1,
    padding: 20,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  reviewSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  removeItemButton: {
    padding: 4,
  },
  removeItemIcon: {
    fontSize: 24,
    color: '#999',
    fontWeight: 'bold',
  },
  itemField: {
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
  },
  itemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  itemInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  dateButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  emptyReview: {
    padding: 40,
    alignItems: 'center',
  },
  emptyReviewText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
