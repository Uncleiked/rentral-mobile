import { Stack } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { useAuth } from '../providers/AuthProvider'
import { colors, fonts } from '../theme'
import { StatusView } from './StatusView'

export function RootNavigator() {
  const { session, loading } = useAuth()
  if (loading) return <View style={styles.loading}><StatusView loading message="Opening Rentral…" /></View>
  return <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerTitleStyle: { fontFamily: fonts.semibold }, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Protected guard={!session}><Stack.Screen name="(auth)" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={Boolean(session)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
      <Stack.Screen name="conversation/[id]" options={{ title: 'Conversation' }} />
      <Stack.Screen name="my-listings" options={{ title: 'My listings' }} />
      <Stack.Screen name="create-listing" options={{ title: 'Create listing' }} />
    </Stack.Protected>
  </Stack>
}
const styles = StyleSheet.create({ loading: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background } })
