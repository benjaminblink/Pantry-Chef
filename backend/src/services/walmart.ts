// Walmart API Service
// Handles all Walmart API integrations using Walmart Affiliate API
// Documentation: https://walmart.io/docs/affiliates/
// Requires: Consumer ID, Private Key (RSA), and Publisher ID

import crypto from 'crypto';

export interface WalmartProduct {
  itemId: number;
  parentItemId?: number;
  name: string;
  salePrice: number;
  msrp?: number;
  thumbnailImage?: string;
  mediumImage?: string;
  largeImage?: string;
  productUrl?: string;
  productTrackingUrl?: string;
  categoryPath?: string;
  brandName?: string;
  stock?: string;
  availableOnline?: boolean;
  customerRating?: string;
  numReviews?: number;
  shortDescription?: string;
  size?: string;
}

interface WalmartApiResponse {
  query?: string;
  totalResults: number;
  start?: number;
  numItems?: number;
  items: WalmartProduct[];
}

export interface WalmartSearchResponse {
  items: WalmartProduct[];
  totalResults: number;
  query: string;
}

const WALMART_API_BASE_URL = 'https://developer.api.walmart.com/api-proxy/service/affil/product/v2';

/**
 * Generate signature for Walmart Affiliate API authentication
 * Format: consumerId\ntimestamp\nkeyVersion\n
 * Signed with RSA-SHA256 using the private key
 */
function generateSignature(
  consumerId: string,
  timestamp: string,
  keyVersion: string,
  privateKey: string
): string {
  try {
    const message = `${consumerId}\n${timestamp}\n${keyVersion}\n`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    const signature = sign.sign(privateKey, 'base64');
    return signature;
  } catch (error) {
    console.error('Error generating signature:', error);
    throw new Error('Failed to generate API signature');
  }
}

/**
 * Get authentication headers for Walmart Affiliate API
 */
function getWalmartHeaders(
  consumerId: string,
  privateKey: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  const keyVersion = process.env.WALMART_KEY_VERSION || '1';
  const signature = generateSignature(consumerId, timestamp, keyVersion, privateKey);

  return {
    'WM_SEC.KEY_VERSION': keyVersion,
    'WM_CONSUMER.ID': consumerId,
    'WM_SEC.AUTH_SIGNATURE': signature,
    'WM_CONSUMER.INTIMESTAMP': timestamp,
    'WM_QOS.CORRELATION_ID': `${timestamp}-${Math.random().toString(36).substring(7)}`,
    'Accept': 'application/json',
  };
}

/**
 * Search for products on Walmart
 */
export async function searchWalmartProducts(
  query: string,
  consumerId: string,
  privateKey: string
): Promise<WalmartSearchResponse> {
  try {
    const params = new URLSearchParams({
      query: query,
      format: 'json',
    });

    const requestUrl = `/search?${params.toString()}`;
    const fullUrl = `${WALMART_API_BASE_URL}${requestUrl}`;

    const headers = getWalmartHeaders(consumerId, privateKey);

    console.log(`Searching Walmart for: "${query}"`);
    console.log(`Request URL: ${fullUrl}`);
    console.log(`Consumer ID: ${consumerId.substring(0, 8)}...`);

    const response = await fetch(fullUrl, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Walmart API error response:', errorText);
      throw new Error(`Walmart API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as WalmartApiResponse;

    console.log(`Walmart search results: ${data.items?.length || 0} items returned (${data.totalResults} total available)`);

    return {
      items: data.items || [],
      totalResults: data.totalResults || 0,
      query: query,
    };
  } catch (error) {
    console.error('Walmart API search error:', error);
    throw error;
  }
}

/**
 * Get product details by item ID
 */
export async function getWalmartProduct(
  itemId: string,
  consumerId: string,
  privateKey: string
): Promise<WalmartProduct | null> {
  try {
    const params = new URLSearchParams({
      format: 'json',
    });

    const requestUrl = `/items/${itemId}?${params.toString()}`;
    const fullUrl = `${WALMART_API_BASE_URL}${requestUrl}`;

    const headers = getWalmartHeaders(consumerId, privateKey);

    console.log(`Fetching Walmart product by ID: ${itemId}`);
    console.log(`Request URL: ${fullUrl}`);

    const response = await fetch(fullUrl, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Walmart API error response:', errorText);
      console.error(`Status: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log('Walmart product lookup response:', JSON.stringify(data, null, 2));

    const dataAny = data as any;
    if (dataAny.items && Array.isArray(dataAny.items) && dataAny.items.length > 0) {
      return dataAny.items[0] as WalmartProduct;
    } else if (dataAny.itemId) {
      return dataAny as WalmartProduct;
    }

    console.error('Unexpected response format from Walmart API');
    return null;
  } catch (error) {
    console.error('Walmart API product lookup error:', error);
    return null;
  }
}

/**
 * Search for a specific ingredient and return the best match
 */
export async function findIngredientPrice(
  ingredientName: string,
  consumerId: string,
  privateKey: string
): Promise<WalmartProduct | null> {
  try {
    const searchResult = await searchWalmartProducts(
      ingredientName,
      consumerId,
      privateKey
    );

    if (searchResult.items && searchResult.items.length > 0) {
      return searchResult.items[0];
    }

    return null;
  } catch (error) {
    console.error('Error finding ingredient price:', error);
    return null;
  }
}

export interface WalmartCartItem {
  itemId: string;
  quantity: number;
}

export interface ConsolidatedCartResponse {
  cartUrl?: string;
  addToCartUrl?: string;
  message?: string;
  error?: string;
}

/**
 * Create a Walmart cart with multiple items using the Consolidated Add to Cart API
 * Documentation: https://walmart.io/docs/affiliates/v1/consolidated-atc
 */
export async function createConsolidatedCart(
  items: WalmartCartItem[],
  consumerId: string,
  privateKey: string,
  publisherId?: string
): Promise<ConsolidatedCartResponse> {
  try {
    const itemsParam = items.map(item => `${item.itemId}:${item.quantity}`).join(',');

    const params = new URLSearchParams({
      ids: itemsParam,
    });

    if (publisherId) {
      params.append('publisherId', publisherId);
    }

    const requestUrl = `/cart?${params.toString()}`;
    const fullUrl = `${WALMART_API_BASE_URL}${requestUrl}`;

    const headers = getWalmartHeaders(consumerId, privateKey);

    console.log(`Creating Walmart cart with ${items.length} items`);
    console.log(`Items: ${itemsParam}`);
    console.log(`Publisher ID: ${publisherId || 'NOT PROVIDED (testing without)'}`);
    console.log(`Request URL: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers
    });

    console.log(`Walmart cart API response status: ${response.status}`);

    const responseText = await response.text();
    console.log(`Walmart cart API response: ${responseText}`);

    if (!response.ok) {
      return {
        error: `Walmart API error: ${response.status} ${response.statusText}`,
        message: responseText,
      };
    }

    try {
      const data = JSON.parse(responseText);
      return {
        cartUrl: data.cartUrl || data.addToCartUrl || data.url,
        addToCartUrl: data.addToCartUrl,
        message: 'Cart created successfully',
      };
    } catch (parseError) {
      return {
        message: responseText,
      };
    }
  } catch (error) {
    console.error('Walmart consolidated cart error:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error creating cart',
    };
  }
}
