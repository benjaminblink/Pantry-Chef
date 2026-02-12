// API Configuration
// Update this IP address to match your computer's network IP

// Get your computer's IP:
// Windows: ipconfig
// Mac/Linux: ifconfig

// For local development:
// - All platforms now use network IP
// - Make sure your phone/emulator is on the same WiFi network

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const NETWORK_IP = Constants.expoConfig?.extra?.hostIp || 'localhost'; // Your computer's IP address
const PORT = '3000';

const getApiUrl = () => {
  // Check for staging environment override
  const stagingUrl = Constants.expoConfig?.extra?.stagingApiUrl;
  if (stagingUrl) {
    return stagingUrl;
  }

  if (__DEV__) {
    // Development mode - use localhost with adb reverse port forwarding
    // Run: adb reverse tcp:3000 tcp:3000
    return `http://localhost:${PORT}/api`;
  }
  // Production mode - update with your production URL when deployed
  return 'https://your-production-url.com/api';
};

export const API_URL = getApiUrl();

// RevenueCat API Key - Get from .env or use default
export const REVENUECAT_API_KEY = Constants.expoConfig?.extra?.revenueCatApiKey || 'test_IupNeuZCCqhYpxgFCsArwahMnbw';

export const config = {
  apiUrl: API_URL,
  networkIp: NETWORK_IP,
  port: PORT,
  revenueCatApiKey: REVENUECAT_API_KEY,
};

// Log the URL being used (for debugging)
console.log('API URL:', API_URL);
