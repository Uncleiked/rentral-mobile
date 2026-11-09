import { useState } from 'react'
import { router } from 'expo-router'
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Page } from '../../src/components/Page'
import { StatusView } from '../../src/components/StatusView'
import { Button } from '../../src/components/Button'
import { ProfileEditor } from '../../src/components/ProfileEditor'
import { useMemberResource } from '../../src/hooks/use-member-resource'
import { useAuth } from '../../src/providers/AuthProvider'
import { config } from '../../src/lib/config'
import { errorMessage } from '../../src/lib/api'
import { memberProfileSchema } from '../../src/lib/member-contracts'
import { colors, fonts, space } from '../../src/theme'

export default function ProfileScreen() {
  const { data, loading, error, refresh, refreshing, replace } = useMemberResource('/me', memberProfileSchema)
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
  async function openCommercial(): Promise<void> {
    setActionError(null)
    try { await Linking.openURL(`${config.apiUrl}/marketplace/purchases`) }
    catch { setActionError('Could not open the web portal. Please try again.') }
  }

  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Page title="Your account" subtitle="Your profile, your plans, your Rentral." refreshing={refreshing} onRefresh={() => { void refresh(true).catch(() => undefined) }}>
      {loading ? <StatusView loading message="Loading your account…" /> : !data ? <StatusView title="Account unavailable" message={error ?? 'Your account could not be loaded.'} onRetry={() => { void refresh(true).catch(() => undefined) }} /> : <>
        {error ? <Text accessibilityRole="alert" selectable style={styles.error}>Could not refresh: {error}</Text> : null}
        <ProfileEditor key={data.id} profile={data} onSaved={replace} />
        {data.username ? <Button title="View public profile" secondary onPress={() => router.push({ pathname: '/profile/[username]', params: { username: data.username! } })} /> : null}
      </>}
      <Button title="My listings" secondary onPress={() => router.push('/my-listings')} />
      <Button title="Dashboard and activity" secondary onPress={() => router.push('/dashboard')} />
      <Button title="Payments and requests" secondary onPress={() => router.push('/financial')} />
      <Button title="Insights and campaigns on the web" secondary onPress={() => { void openCommercial() }} />
      <Text style={styles.help}>Opens the web portal in your browser. Sign in there separately to review prices, purchases and sponsored campaigns.</Text>
      <Button title="Leases, renewals and terminations" secondary onPress={() => router.push('/leases')} />
      <Button title="Squat-Mates shared-home matching" secondary onPress={() => router.push('/squat-mates')} />
      <Button title="Notifications" secondary onPress={() => router.push('/notifications')} />
      <Button title="Remote update settings" secondary onPress={() => router.push('/push-settings')} />
      <Button title="Privacy settings" secondary onPress={() => router.push('/privacy')} />
      <Button title="Account security and sessions" secondary onPress={() => router.push('/settings')} />
      <Button title="Safety reviews and appeals" secondary onPress={() => router.push('/appeals')} />
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
  help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
})
