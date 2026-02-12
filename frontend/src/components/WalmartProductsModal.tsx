import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { API_URL } from '../../config';

export interface WalmartProduct {
  itemId: number | string;
  name: string;
  salePrice: number;
  msrp?: number;
  thumbnailImage?: string;
  mediumImage?: string;
  productUrl?: string;
  brandName?: string;
  stock?: string;
  availableOnline?: boolean;
  customerRating?: string;
  numReviews?: number;
  shortDescription?: string;
}

export interface SubstituteOption {
  id: string;
  name: string;
  conversionRatio: number;
  qualityImpact: string;
  notes?: string;
}

export interface QualityTier {
  tier: 'budget' | 'standard' | 'premium' | 'organic';
  tierLevel: number;
  products: WalmartProduct[];
  avgPrice: number;
  priceRange: { min: number; max: number };
}

type TabType = 'similar' | 'quality' | 'replacements';

interface WalmartProductsModalProps {
  visible: boolean;
  onClose: () => void;
  ingredientName: string;
  ingredientId?: string;
  originalIngredientName?: string; // Original ingredient name before substitutions
  recipeId?: string;
  products: WalmartProduct[];
  loading: boolean;
  onProductSelect?: (product: WalmartProduct) => void;
  onSubstituteSelect?: (substitute: SubstituteOption) => void;
  onQualityTierSelect?: (tier: QualityTier, product: WalmartProduct) => void;
}

export default function WalmartProductsModal({
  visible,
  onClose,
  ingredientName,
  ingredientId,
  originalIngredientName,
  recipeId,
  products,
  loading,
  onProductSelect,
  onSubstituteSelect,
  onQualityTierSelect,
}: WalmartProductsModalProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>('similar');
  const [substitutes, setSubstitutes] = useState<SubstituteOption[]>([]);
  const [qualityTiers, setQualityTiers] = useState<QualityTier[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Fetch substitutes and quality tiers when modal opens
  useEffect(() => {
    console.log('WalmartProductsModal: useEffect triggered', { visible, ingredientId, recipeId });
    if (visible && ingredientId) {
      console.log('WalmartProductsModal: Conditions met, calling fetchIngredientOptions');
      fetchIngredientOptions();
    } else {
      console.log('WalmartProductsModal: Conditions NOT met', {
        visible,
        hasIngredientId: !!ingredientId,
        hasRecipeId: !!recipeId
      });
    }
  }, [visible, ingredientId, recipeId]);

  const fetchIngredientOptions = async () => {
    if (!ingredientId) {
      console.log('WalmartProductsModal: Skipping fetch - missing ingredientId');
      return;
    }

    console.log('WalmartProductsModal: Fetching ingredient options', { ingredientId, recipeId });
    setLoadingOptions(true);
    try {
      // Use recipe-specific endpoint if recipeId is available, otherwise use general endpoint
      const url = recipeId
        ? `${API_URL}/recipes/${recipeId}/ingredient-options/${ingredientId}`
        : `${API_URL}/ingredient-options/${ingredientId}`;
      console.log('WalmartProductsModal: API URL:', url);
      const response = await fetch(url);
      const data = await response.json();
      console.log('WalmartProductsModal: API response status:', response.status, response.ok);
      console.log('WalmartProductsModal: API response data:', JSON.stringify(data, null, 2));

      if (data.success) {
        const substitutesData = data.data.substitutes || [];
        const tiersData = data.data.qualityTiers || [];

        console.log('WalmartProductsModal: Processing substitutes:', substitutesData.length);
        console.log('WalmartProductsModal: Processing quality tiers:', tiersData.length);

        setSubstitutes(substitutesData);

        // Ensure all quality tiers have a valid products array
        const validatedTiers = tiersData.map((tier: QualityTier) => {
          const productsArray = tier.products || [];
          console.log(`WalmartProductsModal: Tier "${tier.tier}" has ${productsArray.length} products`);
          return {
            ...tier,
            products: productsArray
          };
        });

        setQualityTiers(validatedTiers);
        console.log('WalmartProductsModal: Final state - substitutes:', substitutesData.length, 'tiers:', validatedTiers.length);

        if (validatedTiers.length === 0) {
          console.warn('WalmartProductsModal: WARNING - No quality tiers available');
        }
        if (substitutesData.length === 0) {
          console.warn('WalmartProductsModal: WARNING - No substitutes available');
        }
      } else {
        console.error('WalmartProductsModal: API returned success=false:', data);
      }
    } catch (error) {
      console.error('WalmartProductsModal: Error fetching ingredient options:', error);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleProductPress = (product: WalmartProduct) => {
    if (onProductSelect) {
      onProductSelect(product);
      onClose();
    } else {
      if (product.productUrl) {
        Linking.openURL(product.productUrl).catch(() =>
          Alert.alert('Error', 'Unable to open product link')
        );
      } else {
        Alert.alert('No Link', 'Product link not available');
      }
    }
  };

  const handleSubstitutePress = (substitute: SubstituteOption) => {
    if (onSubstituteSelect) {
      onSubstituteSelect(substitute);
      onClose();
    }
  };

  const handleTierProductPress = (tier: QualityTier, product: WalmartProduct) => {
    if (onQualityTierSelect) {
      onQualityTierSelect(tier, product);
      onClose();
    }
  };

  // Debug logging for tab visibility
  console.log('WalmartProductsModal render:', {
    ingredientId,
    recipeId,
    qualityTiersLength: qualityTiers.length,
    substitutesLength: substitutes.length,
    shouldShowQualityTab: (ingredientId && recipeId) || qualityTiers.length > 0,
    shouldShowReplacementsTab: (ingredientId && recipeId) || substitutes.length > 0
  });

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>Product Options</Text>
              <Text style={styles.modalSubtitle}>{ingredientName}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'similar' && styles.activeTab]}
              onPress={() => setSelectedTab('similar')}
            >
              <Text style={[styles.tabText, selectedTab === 'similar' && styles.activeTabText]}>
                Similar
              </Text>
            </TouchableOpacity>

            {/* Show Quality tab always for testing */}
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'quality' && styles.activeTab]}
              onPress={() => setSelectedTab('quality')}
            >
              <Text style={[styles.tabText, selectedTab === 'quality' && styles.activeTabText]}>
                Quality
              </Text>
            </TouchableOpacity>

            {/* Show Replacements tab always for testing */}
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'replacements' && styles.activeTab]}
              onPress={() => setSelectedTab('replacements')}
            >
              <Text style={[styles.tabText, selectedTab === 'replacements' && styles.activeTabText]}>
                Replacements
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content - Similar Products */}
          {selectedTab === 'similar' && loading && (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#34C759" />
              <Text style={styles.loadingText}>Searching Walmart...</Text>
            </View>
          )}
          {selectedTab === 'similar' && !loading && products.length === 0 && (
            <View style={styles.modalEmpty}>
              <Text style={styles.emptyText}>No products found</Text>
              <Text style={styles.emptySubtext}>
                Try searching manually on Walmart
              </Text>
            </View>
          )}
          {selectedTab === 'similar' && !loading && products.length > 0 && (
            <FlatList
              data={products}
              keyExtractor={(item) => item.itemId.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.productCard}
                  onPress={() => handleProductPress(item)}
                  activeOpacity={0.7}
                >
                  {item.thumbnailImage ? (
                    <Image
                      source={{ uri: item.thumbnailImage }}
                      style={styles.productImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <Text style={styles.placeholderText}>No Image</Text>
                    </View>
                  )}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.brandName && (
                      <Text style={styles.productBrand}>{item.brandName}</Text>
                    )}
                    <View style={styles.productPricing}>
                      <Text style={styles.productPrice}>
                        ${item.salePrice.toFixed(2)}
                      </Text>
                      {item.msrp && item.msrp > item.salePrice && (
                        <Text style={styles.productMsrp}>
                          ${item.msrp.toFixed(2)}
                        </Text>
                      )}
                    </View>
                    {item.customerRating && (
                      <View style={styles.productRating}>
                        <Text style={styles.ratingText}>
                          ⭐ {item.customerRating}
                        </Text>
                        {item.numReviews && (
                          <Text style={styles.reviewCount}>
                            ({item.numReviews} reviews)
                          </Text>
                        )}
                      </View>
                    )}
                    {item.availableOnline && (
                      <Text style={styles.availableBadge}>Available Online</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.productsList}
              showsVerticalScrollIndicator={true}
            />
          )}

          {/* Tab Content - Quality Tiers */}
          {selectedTab === 'quality' && (
            <>
              {loadingOptions ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color="#34C759" />
                  <Text style={styles.loadingText}>Loading quality tiers...</Text>
                </View>
              ) : qualityTiers.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Text style={styles.emptyText}>No quality tiers available</Text>
                  <Text style={styles.emptySubtext}>
                    Quality tiers are based on product prices
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={qualityTiers}
                  keyExtractor={(item) => item.tier}
                  renderItem={({ item }) => (
                    <View style={styles.tierCard}>
                      <View style={styles.tierHeader}>
                        <Text style={styles.tierName}>
                          {item.tier.charAt(0).toUpperCase() + item.tier.slice(1)}
                        </Text>
                        <Text style={styles.tierPrice}>
                          Avg: ${item.avgPrice.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.tierRange}>
                        ${item.priceRange.min.toFixed(2)} - ${item.priceRange.max.toFixed(2)}
                      </Text>
                      <Text style={styles.tierCount}>{item.products?.length || 0} products</Text>

                      {/* Show all products in this tier */}
                      {item.products?.map((product) => (
                        <TouchableOpacity
                          key={product.itemId}
                          style={styles.tierProduct}
                          onPress={() => handleTierProductPress(item, product)}
                        >
                          <Text style={styles.tierProductName} numberOfLines={1}>
                            {product.name}
                          </Text>
                          <Text style={styles.tierProductPrice}>
                            ${product.salePrice.toFixed(2)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  contentContainerStyle={styles.productsList}
                  showsVerticalScrollIndicator={true}
                />
              )}
            </>
          )}

          {/* Tab Content - Replacements */}
          {selectedTab === 'replacements' && (
            <>
              {loadingOptions ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color="#34C759" />
                  <Text style={styles.loadingText}>Loading substitutes...</Text>
                </View>
              ) : substitutes.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Text style={styles.emptyText}>No substitutes available</Text>
                  <Text style={styles.emptySubtext}>
                    This ingredient has no common alternatives
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={substitutes}
                  keyExtractor={(item) => item.id}
                  ListHeaderComponent={
                    /* Show original ingredient if it has been substituted */
                    originalIngredientName && ingredientName !== originalIngredientName ? (
                      <TouchableOpacity
                        style={[styles.substituteCard, styles.originalIngredientCard]}
                        onPress={() => handleSubstitutePress({
                          id: 'original',
                          name: originalIngredientName,
                          conversionRatio: 1.0,
                          qualityImpact: 'none',
                          notes: 'Return to original ingredient',
                        })}
                        activeOpacity={0.7}
                      >
                        <View style={styles.substituteInfo}>
                          <Text style={[styles.substituteName, styles.originalIngredientName]}>
                            {originalIngredientName}
                          </Text>
                          <Text style={styles.substituteNotes}>Return to original ingredient</Text>
                          <View style={styles.substituteDetails}>
                            <Text style={styles.substituteRatio}>Use 1.0x amount</Text>
                            <Text style={[styles.substituteImpact, styles.impactNone]}>
                              ✓ Original
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.substituteCard}
                      onPress={() => handleSubstitutePress(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.substituteInfo}>
                        <Text style={styles.substituteName}>{item.name}</Text>
                        {item.notes && (
                          <Text style={styles.substituteNotes}>{item.notes}</Text>
                        )}
                        <View style={styles.substituteDetails}>
                          <Text style={styles.substituteRatio}>
                            Use {item.conversionRatio}x amount
                          </Text>
                          <Text style={[
                            styles.substituteImpact,
                            item.qualityImpact === 'none' && styles.impactNone,
                            item.qualityImpact === 'slight' && styles.impactSlight,
                            item.qualityImpact === 'moderate' && styles.impactModerate,
                          ]}>
                            {item.qualityImpact} impact
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.productsList}
                  showsVerticalScrollIndicator={true}
                />
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  modalLoading: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  modalEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 8,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
  },
  productsList: {
    padding: 15,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  productImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 12,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  productPricing: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
    marginRight: 8,
  },
  productMsrp: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  productRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 12,
    color: '#333',
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 11,
    color: '#999',
  },
  availableBadge: {
    fontSize: 10,
    color: '#28a745',
    backgroundColor: '#d4edda',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    fontWeight: '600',
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#34C759',
    backgroundColor: 'white',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#34C759',
    fontWeight: '600',
  },
  // Quality Tier styles
  tierCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tierPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
  },
  tierRange: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  tierCount: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  tierProduct: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tierProductName: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    marginRight: 8,
  },
  tierProductPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
  },
  // Replacement/Substitute styles
  substituteCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  substituteInfo: {
    flex: 1,
  },
  substituteName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  substituteNotes: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  substituteDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  substituteRatio: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '500',
  },
  substituteImpact: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  impactNone: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  impactSlight: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  impactModerate: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  // Original ingredient styles (when showing "return to original" option)
  originalIngredientCard: {
    backgroundColor: '#e3f2fd', // Light blue background to highlight
    borderWidth: 2,
    borderColor: '#34C759',
  },
  originalIngredientName: {
    color: '#34C759', // Green text to match border
  },
});
