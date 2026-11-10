import { useFonts } from 'expo-font'
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../src/providers/AuthProvider'
import { RootNavigator } from '../src/components/RootNavigator'
import { PushProvider } from '../src/providers/PushProvider'
import { LaunchIntro } from '../src/components/LaunchIntro'
import { colors, motion } from '../src/theme'

if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => undefined)
function hideNativeSplash() {
  if (Platform.OS !== 'web') { try { SplashScreen.hide() } catch { /* Content remains usable if a development host has no native splash. */ } }
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  // A startup render failure must reveal Router's existing error/retry UI too.
  useEffect(hideNativeSplash, [])
  return <View style={styles.root} onLayout={hideNativeSplash}><RouterErrorBoundary {...props} /></View>
}
export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold })
  const [fontBudgetExpired, setFontBudgetExpired] = useState(false), [introDone, setIntroDone] = useState(false)
  useEffect(() => {
    if (loaded || fontError) return
    const timer = setTimeout(() => setFontBudgetExpired(true), motion.fontSafety)
    return () => clearTimeout(timer)
  }, [loaded, fontError])
  const finishIntro = useCallback(() => { hideNativeSplash(); setIntroDone(true) }, [])
  if (!loaded && !fontError && !fontBudgetExpired) return null
  return <SafeAreaProvider><View style={styles.root}>
    <View style={styles.root} accessibilityElementsHidden={!introDone} importantForAccessibility={introDone ? 'auto' : 'no-hide-descendants'}>
      <AuthProvider><PushProvider><StatusBar style="light" /><RootNavigator /></PushProvider></AuthProvider>
    </View>
    {!introDone ? <LaunchIntro onReady={hideNativeSplash} onComplete={finishIntro} /> : null}
  </View></SafeAreaProvider>
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } })
import 'react-native-url-polyfill/auto'
