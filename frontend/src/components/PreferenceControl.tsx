import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Slider from '@react-native-community/slider';
import type { UserPreference } from '../types/mealPlanning';

interface Props {
  preference: UserPreference;
  onUpdate: (value: any) => void;
  onDelete?: () => void;
  showDelete?: boolean;
}

export function PreferenceControl({ preference, onUpdate, onDelete, showDelete = true }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const tagInputRef = useRef<TextInput>(null);

  const renderControl = () => {
    switch (preference.controlType) {
      case 'checkbox':
        return (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => onUpdate(!preference.value)}
          >
            <View style={[styles.checkbox, preference.value && styles.checkboxChecked]}>
              {preference.value && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{preference.label}</Text>
          </TouchableOpacity>
        );

      case 'slider':
        const config = preference.controlConfig || {};
        const min = config.min || 0;
        const max = config.max || 100;
        const step = config.step || 1;
        const unit = config.unit || '';

        return (
          <View style={styles.sliderContainer}>
            <View style={styles.sliderHeader}>
              <Text style={styles.sliderLabel}>{preference.label}</Text>
              <Text style={styles.sliderValue}>
                {preference.value} {unit}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={min}
              maximumValue={max}
              step={step}
              value={typeof preference.value === 'number' ? preference.value : min}
              onValueChange={onUpdate}
              minimumTrackTintColor="#4CAF50"
              maximumTrackTintColor="#ddd"
              thumbTintColor="#4CAF50"
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>{min}{unit}</Text>
              <Text style={styles.sliderLabelText}>{max}{unit}</Text>
            </View>
          </View>
        );

      case 'select':
        const options = preference.controlConfig?.options || [];
        return (
          <View style={styles.selectContainer}>
            <Text style={styles.selectLabel}>{preference.label}</Text>
            <View style={styles.selectOptions}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.selectOption,
                    preference.value === option && styles.selectOptionActive
                  ]}
                  onPress={() => onUpdate(option)}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      preference.value === option && styles.selectOptionTextActive
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'multiselect':
        const multiOptions = preference.controlConfig?.options || [];
        const selectedValues = Array.isArray(preference.value) ? preference.value : [];

        return (
          <View style={styles.multiselectContainer}>
            <Text style={styles.multiselectLabel}>{preference.label}</Text>
            <View style={styles.multiselectOptions}>
              {multiOptions.map((option) => {
                const isSelected = selectedValues.includes(option);
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.multiselectOption,
                      isSelected && styles.multiselectOptionActive
                    ]}
                    onPress={() => {
                      const newValues = isSelected
                        ? selectedValues.filter(v => v !== option)
                        : [...selectedValues, option];
                      onUpdate(newValues);
                    }}
                  >
                    <Text
                      style={[
                        styles.multiselectOptionText,
                        isSelected && styles.multiselectOptionTextActive
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 'tag-input':
        const tags = Array.isArray(preference.value) ? preference.value : [];
        return (
          <View style={styles.tagInputContainer}>
            <Text style={styles.tagInputLabel}>{preference.label}</Text>
            <View style={styles.tags}>
              {tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const newTags = tags.filter((_, i) => i !== index);
                      onUpdate(newTags);
                    }}
                  >
                    <Text style={styles.tagRemove}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TextInput
              ref={tagInputRef}
              style={styles.tagInput}
              placeholder="Type and press enter..."
              onSubmitEditing={(e) => {
                const newTag = e.nativeEvent.text.trim();
                if (newTag && !tags.includes(newTag)) {
                  onUpdate([...tags, newTag]);
                  tagInputRef.current?.clear();
                }
              }}
            />
          </View>
        );

      case 'input':
        return (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{preference.label}</Text>
            <TextInput
              style={styles.input}
              value={String(preference.value || '')}
              onChangeText={(text) => {
                const num = parseFloat(text);
                onUpdate(isNaN(num) ? text : num);
              }}
              keyboardType="numeric"
            />
          </View>
        );

      default:
        return <Text>Unknown control type: {preference.controlType}</Text>;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.controlWrapper}>
        {renderControl()}
        {showDelete && onDelete && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setShowDeleteConfirm(true)}
          >
            <Text style={styles.deleteIcon}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Remove Preference?</Text>
            <Text style={styles.confirmMessage}>
              Remove "{preference.label}" from your preferences?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteConfirmButton]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  onDelete?.();
                }}
              >
                <Text style={styles.deleteButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  controlWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 8,
    zIndex: 10,
  },
  deleteIcon: {
    fontSize: 24,
    color: '#999',
    fontWeight: 'bold',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    flex: 1,
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
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
  },
  sliderContainer: {
    flex: 1,
    paddingRight: 40,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  sliderValue: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabelText: {
    fontSize: 12,
    color: '#999',
  },
  selectContainer: {
    flex: 1,
    paddingRight: 40,
  },
  selectLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  selectOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: 'white',
  },
  selectOptionActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  selectOptionText: {
    fontSize: 14,
    color: '#666',
  },
  selectOptionTextActive: {
    color: 'white',
    fontWeight: '500',
  },
  multiselectContainer: {
    flex: 1,
    paddingRight: 40,
  },
  multiselectLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  multiselectOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  multiselectOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: 'white',
  },
  multiselectOptionActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  multiselectOptionText: {
    fontSize: 13,
    color: '#666',
  },
  multiselectOptionTextActive: {
    color: 'white',
    fontWeight: '500',
  },
  tagInputContainer: {
    flex: 1,
    paddingRight: 40,
  },
  tagInputLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    color: '#2E7D32',
    marginRight: 8,
  },
  tagRemove: {
    fontSize: 18,
    color: '#2E7D32',
    fontWeight: 'bold',
  },
  tagInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  inputContainer: {
    flex: 1,
    paddingRight: 40,
  },
  inputLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmDialog: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  confirmMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  confirmButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '500',
  },
  deleteConfirmButton: {
    backgroundColor: '#f44336',
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: '500',
  },
});
