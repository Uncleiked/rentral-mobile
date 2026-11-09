import { useFonts } from 'expo-font'
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../src/providers/AuthProvider'
import { RootNavigator } from '../src/components/RootNavigator'
import { PushProvider } from '../src/providers/PushProvider'

export { ErrorBoundary } from 'expo-router'
export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold })
  if (!loaded && !fontError) return null
  return <SafeAreaProvider><AuthProvider><PushProvider><StatusBar style="light" /><RootNavigator /></PushProvider></AuthProvider></SafeAreaProvider>
}
import 'react-native-url-polyfill/auto'
