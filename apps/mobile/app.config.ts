import type { ExpoConfig } from 'expo/config'

// Stop before Expo substitutes EXPO_PUBLIC values into the JavaScript bundle.
if (process.env.EXPO_PUBLIC_JWT_SECRET || process.env.EXPO_PUBLIC_MONGODB_URL) {
  throw new Error('JWT secrets and MongoDB connection strings belong only on the backend. The mobile app needs EXPO_PUBLIC_API_URL only.')
}

const config: ExpoConfig = {
  name: 'Rentral', slug: 'rentral-mobile', version: '1.0.0', scheme: 'rentral',
  orientation: 'portrait', userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'com.rentral.mobile' },
  android: { package: 'com.rentral.mobile' },
  plugins: ['expo-router', 'expo-font', 'expo-secure-store',
    ['expo-camera', { cameraPermission: 'Allow Rentral to record a walkthrough of your listing.', microphonePermission: false, recordAudioAndroid: false }],
    ['expo-location', { locationWhenInUsePermission: 'Allow Rentral to record the location of your listing while you capture its walkthrough.' }],
    'expo-document-picker',
  ],
  web: { bundler: 'metro', output: 'single' },
  experiments: { typedRoutes: true },
}

export default config
