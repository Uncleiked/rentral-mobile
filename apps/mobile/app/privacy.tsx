import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { Host, Switch } from '@expo/ui'
import { Page } from '../src/components/Page'
import { StatusView } from '../src/components/StatusView'
import { Button } from '../src/components/Button'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { analyticsPrivacySchema } from '../src/lib/member-contracts'
import { removeMemberAnalyticsHistory, setMemberAnalyticsConsent } from '../src/lib/member-api'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'
import { useAuth } from '../src/providers/AuthProvider'
import { nativeAnalytics } from '../src/lib/native-analytics'

export default function PrivacyScreen() {
  const resource = useMemberResource('/privacy/analytics', analyticsPrivacySchema)
  const { session } = useAuth(), actorId = session?.user.id ?? ''
  useEffect(() => { if (actorId && resource.data) nativeAnalytics.permission(actorId, resource.data.allowed) }, [actorId, resource.data])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  async function consent(allowed: boolean): Promise<void> {
    if (pending.current || !actorId) return
    nativeAnalytics.permission(actorId, false)
    pending.current = true; setBusy(true); setMessage(null); setFailed(false)
    try { const updated = await setMemberAnalyticsConsent(allowed, actorId); nativeAnalytics.permission(actorId, updated.allowed); resource.replace(updated); setMessage(updated.allowed ? 'Your preference is saved. Collection follows the server’s availability and retention rules.' : 'Analytics collection is turned off for your account across devices.') }
    catch (reason) { setFailed(true); setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function removeHistory(): Promise<void> {
    if (pending.current || !resource.data || !actorId) return
    nativeAnalytics.permission(actorId, false)
    pending.current = true; setBusy(true); setMessage(null); setFailed(false)
    try {
      await removeMemberAnalyticsHistory(actorId)
      resource.replace({ ...resource.data, allowed: false, updatedAt: null })
      setMessage('Your analytics history is removed and collection is turned off.')
      void resource.refresh().catch(() => undefined)
    } catch (reason) { setFailed(true); setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <>
    <Stack.Screen options={{ title: 'Privacy', headerShown: true }} />
    <Page title="Your privacy" subtitle="Choose how your marketplace preferences contribute to Rentral Insights." refreshing={resource.refreshing} onRefresh={() => { void resource.refresh(true).catch(() => undefined) }}>
      {resource.loading ? <StatusView loading message="Loading your privacy settings…" /> : !resource.data ? <StatusView title="Privacy settings unavailable" message={resource.error ?? 'Try loading your settings again.'} onRetry={() => { void resource.refresh(true).catch(() => undefined) }} /> : <>
        <View style={styles.card}><Text style={styles.heading}>Preference analytics</Text><Text style={styles.help}>Optional, coarse search, listing and checkout observations help describe marketplace demand. Raw GPS, messages, documents and payment credentials are excluded. Small reporting groups are withheld.</Text>
          <Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Switch label="Allow preference analytics" value={resource.data.allowed} onValueChange={value => { void consent(value) }} disabled={busy} testID="analytics-consent" /></Host>
          {!resource.data.collectionEnabled ? <Text style={styles.help}>Collection is currently unavailable on the server. Your saved choice applies when it becomes available.</Text> : null}
          <Text style={styles.help}>Retention: up to {resource.data.retentionDays} days. Your choice is stored for this account and applies across devices.</Text>
          {resource.data.updatedAt ? <Text selectable style={styles.help}>Preference updated {new Date(resource.data.updatedAt).toLocaleString()}.</Text> : null}
        </View>
        <View style={styles.card}><Text style={styles.heading}>Remove analytics history</Text><Text style={styles.help}>Delete your retained preference events and turn off future collection. Bookings, payment records, messages and reviews are kept separately.</Text><Button title="Delete analytics history and turn off" secondary busy={busy} onPress={() => { void removeHistory() }} /></View>
        {resource.error ? <Text accessibilityRole="alert" selectable style={styles.error}>Could not refresh: {resource.error}</Text> : null}
      </>}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={failed ? styles.error : styles.notice}>{message}</Text> : null}
    </Page>
  </>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, notice: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
