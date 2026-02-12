import { useState } from 'react';
import { Alert } from 'react-native';
import { API_URL } from '../../config';
import type { WalmartProduct } from '../components/WalmartProductsModal';

export function useWalmartProducts() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<string>('');
  const [similarProducts, setSimilarProducts] = useState<WalmartProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const searchSimilarProducts = async (ingredientName: string) => {
    setSelectedIngredient(ingredientName);
    setModalVisible(true);
    setLoadingProducts(true);
    setSimilarProducts([]);

    try {
      const response = await fetch(
        `${API_URL}/walmart/similar/${encodeURIComponent(ingredientName)}?limit=10`
      );
      const data = await response.json();

      if (data.success && data.data.items) {
        setSimilarProducts(data.data.items);
      } else {
        Alert.alert('No Products Found', `No similar products found for "${ingredientName}"`);
      }
    } catch (error) {
      console.error('Error fetching similar products:', error);
      Alert.alert('Error', 'Failed to fetch similar products from Walmart');
    } finally {
      setLoadingProducts(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  return {
    modalVisible,
    selectedIngredient,
    similarProducts,
    loadingProducts,
    searchSimilarProducts,
    closeModal,
  };
}
