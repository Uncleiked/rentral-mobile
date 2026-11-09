import type { ExpoConfig } from 'expo/config'

// Stop before Expo substitutes EXPO_PUBLIC values into the JavaScript bundle.
if (Object.keys(process.env).some(key => key.startsWith('EXPO_PUBLIC_') && /JWT|MONGODB|DATABASE|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|API_KEY/.test(key))) {
  throw new Error('Keep private keys and database connections on the backend. Mobile public settings are EXPO_PUBLIC_API_URL and the optional EXPO_PUBLIC_EAS_PROJECT_ID.')
}

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
if (easProjectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(easProjectId)) {
  throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID must be the public EAS project UUID. Leave it unset until configuring device push.')
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
    'expo-sharing',
    ['expo-image-picker', {
      photosPermission: 'Allow Rentral to choose your profile photo.',
      cameraPermission: 'Allow Rentral to record a walkthrough of your listing.',
      microphonePermission: false,
    }],
    'expo-notifications',
    'expo-web-browser',
  ],
  web: { bundler: 'metro', output: 'single' },
  experiments: { typedRoutes: true },
  ...(easProjectId ? { extra: { eas: { projectId: easProjectId.toLowerCase() } } } : {}),
}

export default config
