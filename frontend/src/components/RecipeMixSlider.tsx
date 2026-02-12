import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

interface Props {
  value: number; // 0.0 to 1.0 (ratio of existing recipes)
  totalMeals: number;
  onChange: (value: number) => void;
}

export function RecipeMixSlider({ value, totalMeals, onChange }: Props) {
  const existingCount = Math.round(totalMeals * value);
  const newCount = totalMeals - existingCount;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>🥘 Recipe Mix</Text>
      <Text style={styles.description}>
        How many recipes should be reused vs freshly generated?
      </Text>

      <View style={styles.sliderRow}>
        <View style={styles.sliderLabelContainer}>
          <Text style={styles.sliderLabelIcon}>✨</Text>
          <Text style={styles.sliderLabel}>Generate{'\n'}new</Text>
        </View>

        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.05}
          value={value || 0}
          onValueChange={onChange}
          minimumTrackTintColor="#FF9800"
          maximumTrackTintColor="#4CAF50"
          thumbTintColor="#666"
        />

        <View style={styles.sliderLabelContainer}>
          <Text style={styles.sliderLabelIcon}>♻️</Text>
          <Text style={styles.sliderLabel}>Reuse{'\n'}existing</Text>
        </View>
      </View>

      <View style={styles.countsContainer}>
        <View style={styles.countBadge}>
          <View style={[styles.countDot, styles.existingDot]} />
          <View style={styles.countInfo}>
            <Text style={styles.countNumber}>{existingCount}</Text>
            <Text style={styles.countLabel}>Existing recipes</Text>
          </View>
        </View>

        <Text style={styles.plusSign}>+</Text>

        <View style={styles.countBadge}>
          <View style={[styles.countDot, styles.newDot]} />
          <View style={styles.countInfo}>
            <Text style={styles.countNumber}>{newCount}</Text>
            <Text style={styles.countLabel}>New recipes</Text>
          </View>
        </View>
      </View>

      {value > 0.6 && (
        <View style={[styles.hint, styles.hintExisting]}>
          <Text style={styles.hintIcon}>💡</Text>
          <Text style={styles.hintText}>
            We'll pick your highest-rated recipes that match your preferences
          </Text>
        </View>
      )}

      {value < 0.4 && (
        <View style={[styles.hint, styles.hintNew]}>
          <Text style={styles.hintIcon}>✨</Text>
          <Text style={styles.hintText}>
            New recipes will match your cooking style based on what you've enjoyed
          </Text>
        </View>
      )}

      {value >= 0.4 && value <= 0.6 && (
        <View style={[styles.hint, styles.hintBalanced]}>
          <Text style={styles.hintIcon}>⚖️</Text>
          <Text style={styles.hintText}>
            Balanced mix of familiar favorites and exciting new dishes
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sliderLabelContainer: {
    alignItems: 'center',
    width: 70,
  },
  sliderLabelIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  sliderLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: 14,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  countsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  existingDot: {
    backgroundColor: '#4CAF50',
  },
  newDot: {
    backgroundColor: '#FF9800',
  },
  countInfo: {
    alignItems: 'center',
  },
  countNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  countLabel: {
    fontSize: 12,
    color: '#666',
  },
  plusSign: {
    fontSize: 20,
    color: '#999',
    marginHorizontal: 16,
    fontWeight: 'bold',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  hintExisting: {
    backgroundColor: '#E8F5E9',
  },
  hintNew: {
    backgroundColor: '#FFF3E0',
  },
  hintBalanced: {
    backgroundColor: '#E3F2FD',
  },
  hintIcon: {
    fontSize: 18,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
});
