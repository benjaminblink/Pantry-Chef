export default {
  expo: {
    name: 'Pantry Chef',
    slug: 'pantry-chef',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/pantry-chef-icon-v5.png',
    scheme: 'pantrychef',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      package: 'com.pantrychef.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: 'pan',
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      '@react-native-community/datetimepicker',
      [
        'expo-splash-screen',
        {
          image: './assets/pantry-chef-icon-v5.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      hostIp: process.env.HOST_IP || 'localhost',
      stagingApiUrl: process.env.EXPO_PUBLIC_STAGING_API_URL || null,
      productionApiUrl: process.env.EXPO_PUBLIC_PRODUCTION_API_URL || null,
    },
  },
};
