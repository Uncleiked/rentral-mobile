import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { Stack } from 'expo-router'
import { Page } from '../src/components/Page'
import { StatusView } from '../src/components/StatusView'
import { MatchingProfileEditor } from '../src/components/matching-profile-editor'
import { useAuth } from '../src/providers/AuthProvider'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { ownMatchingSchema } from '../src/lib/matching-api'
import { colors } from '../src/theme'

export default function MatchingProfileScreen() {
  const { session } = useAuth()
  const profile = useMemberResource('/squat-mates/profile', ownMatchingSchema)
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Stack.Screen options={{ title: 'Matching preferences' }} /><Page title="Your shared-home preferences" subtitle="Choose the areas, budget and daily routines you want to share with potential housemates.">
    {profile.loading ? <StatusView loading message="Opening matching preferences…" /> : !profile.data || !session ? <StatusView title="Preferences unavailable" message={profile.error ?? 'Sign in and retry.'} onRetry={() => { void profile.refresh().catch(() => undefined) }} /> : <MatchingProfileEditor key={session.user.id} saved={profile.data} actorId={session.user.id} onSaved={profile.replace} refresh={() => profile.refresh(true)} />}
  </Page></KeyboardAvoidingView>
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background } })
