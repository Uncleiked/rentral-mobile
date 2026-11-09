import { useState } from 'react'
import { router } from 'expo-router'
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Page } from '../../src/components/Page'
import { StatusView } from '../../src/components/StatusView'
import { Button } from '../../src/components/Button'
import { ProfileEditor } from '../../src/components/ProfileEditor'
import { useApiResource } from '../../src/hooks/useApiResource'
import { useAuth } from '../../src/providers/AuthProvider'
import { config } from '../../src/lib/config'
import { errorMessage } from '../../src/lib/api'
import type { Profile } from '../../src/lib/types'
import { colors, fonts, space } from '../../src/theme'

type MemberProfile = Profile & { platformAvailable: boolean }

export default function ProfileScreen() {
  const { data, loading, error, refresh } = useApiResource<MemberProfile>('/me')
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function leave(): Promise<void> {
    setBusy(true); setActionError(null)
    try { await signOut() } catch (reason) { setActionError(errorMessage(reason)) }
    finally { setBusy(false) }
  }

  async function openLegal(path: '/privacy' | '/terms'): Promise<void> {
    setActionError(null)
    try { await Linking.openURL(`${config.apiUrl}${path}`) } catch { setActionError('Could not open this page. Please try again.') }
  }

  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Page title="Your account" subtitle="Your profile, your plans, your Rentral.">
      {loading ? <StatusView loading message="Loading your account…" /> : error ? <StatusView title="Account unavailable" message={error} onRetry={refresh} /> : data ? <ProfileEditor key={data.id} profile={data} /> : null}
      <Button title="My listings" secondary onPress={() => router.push('/my-listings')} />
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => { void openLegal('/privacy') }} style={styles.link}><Text style={styles.linkText}>Privacy policy</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => { void openLegal('/terms') }} style={styles.link}><Text style={styles.linkText}>Terms of use</Text></Pressable>
      </View>
      <Button title="Sign out" secondary busy={busy} onPress={() => { void leave() }} />
      {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
    </Page>
  </KeyboardAvoidingView>
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background }, links: { gap: space.sm }, link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 14 }, error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
})
