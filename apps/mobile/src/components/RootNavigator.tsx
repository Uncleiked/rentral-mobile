import { Stack } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { useAuth } from '../providers/AuthProvider'
import { colors, fonts } from '../theme'
import { StatusView } from './StatusView'

export function RootNavigator() {
  const { session, loading } = useAuth()
  if (loading) return <View style={styles.loading}><StatusView loading message="Opening Rentral…" /></View>
  return <Stack key={session?.user.id ?? 'anonymous'} screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerTitleStyle: { fontFamily: fonts.semibold }, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="confirm-email-change" options={{ title: 'Confirm email change' }} />
    <Stack.Protected guard={!session}><Stack.Screen name="(auth)" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={Boolean(session)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
      <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
      <Stack.Screen name="profile/[username]" options={{ title: 'Host profile' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="push-settings" options={{ title: 'Remote update settings' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy choices' }} />
      <Stack.Screen name="settings" options={{ title: 'Account security' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin' }} />
      <Stack.Screen name="appeals" options={{ title: 'Safety and appeals' }} />
      <Stack.Screen name="financial" options={{ title: 'Payments and refunds' }} />
      <Stack.Screen name="financial-request" options={{ title: 'Payment review request' }} />
      <Stack.Screen name="bank-recipient" options={{ title: 'Payout bank account' }} />
      <Stack.Screen name="conversation/[id]" options={{ title: 'Conversation' }} />
      <Stack.Screen name="my-listings" options={{ title: 'My listings' }} />
      <Stack.Screen name="create-listing" options={{ title: 'Create listing' }} />
      <Stack.Screen name="owner-listing/[id]" options={{ title: 'Manage listing' }} />
      <Stack.Screen name="vault" options={{ title: 'Private media vault' }} />
      <Stack.Screen name="discovery-filters" options={{ title: 'Discovery filters', presentation: 'formSheet', sheetGrabberVisible: true }} />
      <Stack.Screen name="walkthrough-feed" options={{ title: 'Walkthrough feed' }} />
      <Stack.Screen name="leases" options={{ title: 'Leases and changes' }} />
      <Stack.Screen name="lease/[id]" options={{ title: 'Lease details' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Your dashboard' }} />
      <Stack.Screen name="account-export" options={{ title: 'Export account records' }} />
      <Stack.Screen name="close-account" options={{ title: 'Close account' }} />
      <Stack.Screen name="saved-searches" options={{ title: 'Saved searches' }} />
      <Stack.Screen name="squat-mates" options={{ title: 'Squat-Mates' }} />
      <Stack.Screen name="matching-profile" options={{ title: 'Matching preferences' }} />
      <Stack.Screen name="matching-connections" options={{ title: 'Matching contacts' }} />
      <Stack.Screen name="matching-history" options={{ title: 'Matching privacy history' }} />
      <Stack.Screen name="match-report" options={{ title: 'Private matching report' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Matching contact' }} />
    </Stack.Protected>
  </Stack>
}
const styles = StyleSheet.create({ loading: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background } })
